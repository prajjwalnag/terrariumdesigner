/*
  Spider cam: live video, motion detection and saved photos on an AI-Thinker ESP32-CAM.

  Board:  "AI Thinker ESP32-CAM"  (Arduino IDE, ESP32 boards package by Espressif)
  Needs:  a FAT32 microSD card (up to 32 GB) in the board's card slot, to keep photos.

  Open:   http://<the IP address printed in the Serial Monitor>/       live view and status
          http://<ip>/photos    list of saved photos      http://<ip>/capture   one JPEG now
          http://<ip>:81/stream video stream

  How motion detection works: about twice a second the camera takes a frame, shrinks it to a 40 x 30 grid of
  brightness values and compares it with the last one. If enough cells changed, it saves a few photos to the card,
  then waits before saving again. A still spider will not trigger it; a moving one, a cricket or a shadow will.
  Tune the numbers below. The flash LED is kept off so it never lights up the spider.

  1. Fill in WIFI_SSID and WIFI_PASSWORD.
  2. Upload (hold IO0 to GND while uploading if your board has no programmer base), then remove the jumper and reset.
  3. Keep the board OUTSIDE the humid space and power it from a stable 5 V supply (at least 500 mA).
*/
#include "esp_camera.h"
#include "img_converters.h"
#include <WiFi.h>
#include <time.h>
#include <vector>
#include <algorithm>
#include "FS.h"
#include "SD_MMC.h"
#include "esp_http_server.h"

const char* WIFI_SSID     = "your-wifi-name";
const char* WIFI_PASSWORD = "your-wifi-password";

// ---- Motion settings ----
const bool          MOTION_ENABLED   = true;
const int           CELL_THRESHOLD   = 25;     // brightness change (0-255) for one grid cell to count as changed
const int           CELLS_TO_TRIGGER = 6;      // changed cells (of 1200) needed to call it motion; lower = more sensitive
const unsigned long CHECK_MS         = 500;    // how often to look for motion
const unsigned long COOLDOWN_MS      = 8000;   // minimum time between saved events
const int           PHOTOS_PER_EVENT = 3;      // photos saved each time
const unsigned long PHOTO_GAP_MS     = 400;    // pause between those photos
const int           GRID_W = 40, GRID_H = 30;

// AI-Thinker ESP32-CAM pin map
#define PWDN_GPIO_NUM   32
#define RESET_GPIO_NUM  -1
#define XCLK_GPIO_NUM    0
#define SIOD_GPIO_NUM   26
#define SIOC_GPIO_NUM   27
#define Y9_GPIO_NUM     35
#define Y8_GPIO_NUM     34
#define Y7_GPIO_NUM     39
#define Y6_GPIO_NUM     36
#define Y5_GPIO_NUM     21
#define Y4_GPIO_NUM     19
#define Y3_GPIO_NUM     18
#define Y2_GPIO_NUM      5
#define VSYNC_GPIO_NUM  25
#define HREF_GPIO_NUM   23
#define PCLK_GPIO_NUM   22
#define FLASH_LED_PIN    4

static const char* PAGE =
  "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'>"
  "<title>Spider cam</title><body style='margin:0;background:#111;color:#eee;font:16px system-ui;text-align:center'>"
  "<h3>Spider cam</h3><img id=v style='max-width:100%;border-radius:8px'>"
  "<p id=s>Loading status...</p>"
  "<p><a style='color:#8fd' href='/photos'>Saved photos</a> &middot; "
  "<a style='color:#8fd' href='/capture' download='spider.jpg'>Save a picture now</a></p>"
  "<script>document.getElementById('v').src='http://'+location.hostname+':81/stream';"
  "fetch('/status').then(r=>r.json()).then(j=>{document.getElementById('s').textContent="
  "(j.sd?'Card ok. ':'No card found. ')+'Motion saving '+(j.motion?'on':'off')+'. Photos saved since start: '+j.photos})</script>";

#define PART_BOUNDARY "123456789000000000000987654321"
static const char* STREAM_TYPE = "multipart/x-mixed-replace;boundary=" PART_BOUNDARY;
static const char* STREAM_BOUNDARY = "\r\n--" PART_BOUNDARY "\r\n";
static const char* STREAM_PART = "Content-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n";

httpd_handle_t web_httpd = NULL;
httpd_handle_t stream_httpd = NULL;

bool sdOk = false;
int photosSaved = 0;
unsigned long lastCheck = 0, lastEvent = 0;
static uint8_t prevGrid[GRID_W * GRID_H];
static bool havePrev = false;
static uint8_t* rgb = nullptr;  // decoded frame, kept in PSRAM

// ---------------------------------------------------------------- web pages
static esp_err_t index_handler(httpd_req_t* req) {
  httpd_resp_set_type(req, "text/html");
  return httpd_resp_send(req, PAGE, HTTPD_RESP_USE_STRLEN);
}

static esp_err_t status_handler(httpd_req_t* req) {
  char buf[96];
  snprintf(buf, sizeof(buf), "{\"sd\":%s,\"motion\":%s,\"photos\":%d}", sdOk ? "true" : "false", MOTION_ENABLED ? "true" : "false", photosSaved);
  httpd_resp_set_type(req, "application/json");
  return httpd_resp_send(req, buf, HTTPD_RESP_USE_STRLEN);
}

static esp_err_t capture_handler(httpd_req_t* req) {
  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) { httpd_resp_send_500(req); return ESP_FAIL; }
  httpd_resp_set_type(req, "image/jpeg");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  esp_err_t res = httpd_resp_send(req, (const char*)fb->buf, fb->len);
  esp_camera_fb_return(fb);
  return res;
}

static esp_err_t stream_handler(httpd_req_t* req) {
  esp_err_t res = httpd_resp_set_type(req, STREAM_TYPE);
  if (res != ESP_OK) return res;
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  char part[64];
  while (true) {
    camera_fb_t* fb = esp_camera_fb_get();
    if (!fb) { res = ESP_FAIL; break; }
    res = httpd_resp_send_chunk(req, STREAM_BOUNDARY, strlen(STREAM_BOUNDARY));
    if (res == ESP_OK) {
      size_t n = snprintf(part, sizeof(part), STREAM_PART, fb->len);
      res = httpd_resp_send_chunk(req, part, n);
    }
    if (res == ESP_OK) res = httpd_resp_send_chunk(req, (const char*)fb->buf, fb->len);
    esp_camera_fb_return(fb);
    if (res != ESP_OK) break;  // viewer closed the page
  }
  return res;
}

static esp_err_t photos_handler(httpd_req_t* req) {
  httpd_resp_set_type(req, "text/html");
  httpd_resp_sendstr_chunk(req, "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'>"
    "<title>Spider photos</title><body style='font:16px system-ui;margin:16px'><h3>Saved photos (newest first)</h3>");
  if (!sdOk) {
    httpd_resp_sendstr_chunk(req, "<p>No SD card found.</p>");
  } else {
    std::vector<String> names;
    File dir = SD_MMC.open("/spidercam");
    if (dir) {
      File f = dir.openNextFile();
      while (f) {
        String n = String(f.name());
        int slash = n.lastIndexOf('/');
        if (slash >= 0) n = n.substring(slash + 1);
        if (n.endsWith(".jpg")) names.push_back(n);
        f.close();
        f = dir.openNextFile();
      }
      dir.close();
    }
    std::sort(names.begin(), names.end(), [](const String& a, const String& b) { return a > b; });
    for (size_t i = 0; i < names.size() && i < 200; i++) {
      String row = "<a href='/file?n=" + names[i] + "'>" + names[i] + "</a><br>";
      httpd_resp_sendstr_chunk(req, row.c_str());
    }
    if (names.empty()) httpd_resp_sendstr_chunk(req, "<p>No photos yet.</p>");
  }
  httpd_resp_sendstr_chunk(req, "<p><a href='/'>Back to live view</a></p>");
  return httpd_resp_sendstr_chunk(req, NULL);
}

static esp_err_t file_handler(httpd_req_t* req) {
  char query[96], name[64];
  if (httpd_req_get_url_query_str(req, query, sizeof(query)) != ESP_OK || httpd_query_key_value(query, "n", name, sizeof(name)) != ESP_OK) {
    httpd_resp_send_404(req); return ESP_FAIL;
  }
  // Only plain file names ending in .jpg, so nobody can read other paths on the card.
  size_t len = strlen(name);
  bool ok = len > 4 && strcmp(name + len - 4, ".jpg") == 0;
  for (size_t i = 0; ok && i < len; i++) ok = isalnum((unsigned char)name[i]) || name[i] == '-' || name[i] == '.';
  if (!ok || !sdOk) { httpd_resp_send_404(req); return ESP_FAIL; }
  File f = SD_MMC.open(String("/spidercam/") + name, FILE_READ);
  if (!f) { httpd_resp_send_404(req); return ESP_FAIL; }
  httpd_resp_set_type(req, "image/jpeg");
  uint8_t* buf = (uint8_t*)malloc(4096);
  if (!buf) { f.close(); httpd_resp_send_500(req); return ESP_FAIL; }
  esp_err_t res = ESP_OK;
  while (f.available() && res == ESP_OK) {
    size_t n = f.read(buf, 4096);
    res = httpd_resp_send_chunk(req, (const char*)buf, n);
  }
  free(buf);
  f.close();
  httpd_resp_send_chunk(req, NULL, 0);
  return res;
}

void startServers() {
  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.server_port = 80;
  config.max_uri_handlers = 8;
  httpd_uri_t uris[] = {
    { "/",        HTTP_GET, index_handler,   NULL },
    { "/status",  HTTP_GET, status_handler,  NULL },
    { "/capture", HTTP_GET, capture_handler, NULL },
    { "/photos",  HTTP_GET, photos_handler,  NULL },
    { "/file",    HTTP_GET, file_handler,    NULL },
  };
  if (httpd_start(&web_httpd, &config) == ESP_OK) {
    for (auto& u : uris) httpd_register_uri_handler(web_httpd, &u);
  }
  config.server_port = 81;
  config.ctrl_port += 1;  // the second server needs its own control port
  httpd_uri_t stream_uri = { "/stream", HTTP_GET, stream_handler, NULL };
  if (httpd_start(&stream_httpd, &config) == ESP_OK) {
    httpd_register_uri_handler(stream_httpd, &stream_uri);
  }
}

// ---------------------------------------------------------------- motion + saving
// Shrink the frame to a GRID_W x GRID_H grid of brightness values and count the cells that changed since last time.
bool detectMotion(camera_fb_t* fb) {
  if (!rgb) rgb = (uint8_t*)ps_malloc((size_t)fb->width * fb->height * 3);
  if (!rgb || !fmt2rgb888(fb->buf, fb->len, fb->format, rgb)) return false;
  int cw = fb->width / GRID_W, ch = fb->height / GRID_H, changed = 0;
  for (int gy = 0; gy < GRID_H; gy++) {
    for (int gx = 0; gx < GRID_W; gx++) {
      long sum = 0; int n = 0;
      for (int y = gy * ch; y < (gy + 1) * ch; y += 4) {
        for (int x = gx * cw; x < (gx + 1) * cw; x += 4) {
          const uint8_t* p = rgb + ((size_t)y * fb->width + x) * 3;
          sum += (p[0] * 30 + p[1] * 59 + p[2] * 11) / 100;
          n++;
        }
      }
      uint8_t avg = n ? sum / n : 0;
      int i = gy * GRID_W + gx;
      if (havePrev && abs((int)avg - (int)prevGrid[i]) > CELL_THRESHOLD) changed++;
      prevGrid[i] = avg;
    }
  }
  havePrev = true;
  return changed >= CELLS_TO_TRIGGER;
}

String stamp() {
  time_t t = time(nullptr);
  if (t > 1700000000) {  // clock has been set from the internet (UTC)
    struct tm tm; gmtime_r(&t, &tm);
    char b[24]; strftime(b, sizeof(b), "%Y%m%d-%H%M%S", &tm);
    return String(b);
  }
  return String("up") + String(millis() / 1000);  // seconds since power-on until the clock is set
}

bool cardHasRoom() { return SD_MMC.totalBytes() == 0 || SD_MMC.usedBytes() < SD_MMC.totalBytes() * 0.95; }

void recordEvent() {
  if (!sdOk || !cardHasRoom()) { Serial.println("Card missing or nearly full, not saving."); lastEvent = millis(); return; }
  String base = String("/spidercam/") + stamp();
  for (int i = 0; i < PHOTOS_PER_EVENT; i++) {
    camera_fb_t* fb = esp_camera_fb_get();
    if (!fb) continue;
    File f = SD_MMC.open(base + "-" + String(i + 1) + ".jpg", FILE_WRITE);
    if (f) { f.write(fb->buf, fb->len); f.close(); photosSaved++; }
    esp_camera_fb_return(fb);
    delay(PHOTO_GAP_MS);
  }
  Serial.println("Motion: saved " + base);
  lastEvent = millis();
}

// ---------------------------------------------------------------- setup and loop
void setup() {
  Serial.begin(115200);
  camera_config_t c;
  memset(&c, 0, sizeof(c));  // unset fields must be zero, not random
  c.ledc_channel = LEDC_CHANNEL_0;
  c.ledc_timer = LEDC_TIMER_0;
  c.pin_d0 = Y2_GPIO_NUM;  c.pin_d1 = Y3_GPIO_NUM;  c.pin_d2 = Y4_GPIO_NUM;  c.pin_d3 = Y5_GPIO_NUM;
  c.pin_d4 = Y6_GPIO_NUM;  c.pin_d5 = Y7_GPIO_NUM;  c.pin_d6 = Y8_GPIO_NUM;  c.pin_d7 = Y9_GPIO_NUM;
  c.pin_xclk = XCLK_GPIO_NUM;  c.pin_pclk = PCLK_GPIO_NUM;
  c.pin_vsync = VSYNC_GPIO_NUM;  c.pin_href = HREF_GPIO_NUM;
  c.pin_sccb_sda = SIOD_GPIO_NUM;  c.pin_sccb_scl = SIOC_GPIO_NUM;
  c.pin_pwdn = PWDN_GPIO_NUM;  c.pin_reset = RESET_GPIO_NUM;
  c.xclk_freq_hz = 20000000;
  c.pixel_format = PIXFORMAT_JPEG;
  c.frame_size = FRAMESIZE_VGA;   // 640 x 480
  c.jpeg_quality = 12;            // lower number = better quality, bigger files
  c.fb_count = 2;
  c.fb_location = CAMERA_FB_IN_PSRAM;
  c.grab_mode = CAMERA_GRAB_LATEST;
  if (esp_camera_init(&c) != ESP_OK) { Serial.println("Camera init failed. Check the ribbon cable and power."); return; }

  // microSD in 1-bit mode, which leaves the flash LED pin free. Keep the LED off.
  sdOk = SD_MMC.begin("/sdcard", true);
  pinMode(FLASH_LED_PIN, OUTPUT);
  digitalWrite(FLASH_LED_PIN, LOW);
  if (sdOk) SD_MMC.mkdir("/spidercam"); else Serial.println("No SD card found. Live view works, but photos cannot be saved.");

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  WiFi.setSleep(false);
  while (WiFi.status() != WL_CONNECTED) { delay(400); Serial.print("."); }
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");  // sets the clock for file names (UTC)
  Serial.print("\nOpen http://"); Serial.println(WiFi.localIP());
  startServers();
}

void loop() {
  if (MOTION_ENABLED && sdOk && millis() - lastCheck >= CHECK_MS) {
    lastCheck = millis();
    camera_fb_t* fb = esp_camera_fb_get();
    if (fb) {
      bool moved = detectMotion(fb);
      esp_camera_fb_return(fb);
      if (moved && millis() - lastEvent > COOLDOWN_MS) recordEvent();
    }
  }
  delay(20);
}
