import { escapeHtml } from './format.js';

/** HTML for a species' info card. `designSpan` is the leg span text of the current design, if any. */
export function speciesCardHtml(i, designSpan) {
  const fact = (k, v, wide) => `<div${wide ? ' class="wide"' : ''}><dt>${k}</dt><dd>${escapeHtml(v)}</dd></div>`;
  const caution = i.level === 2 || i.note ? `<p class="caution">${escapeHtml(i.note || 'Fast and defensive. Plan a secure lid and avoid handling.')}</p>` : '';
  return `<h2>${escapeHtml(i.name)}</h2><p class="sci">${escapeHtml(i.sci)}</p>
    <div class="tags"><span class="tag">${i.type === 'terr' ? 'Ground dweller' : 'Tree dweller'}</span><span class="tag">${escapeHtml(i.group)}</span><span class="tag l${i.level}">${escapeHtml(i.temper)}</span></div>
    <dl class="facts">
      ${fact('Adult leg span', designSpan ? `about ${i.cm} cm · your design uses ${designSpan}` : `about ${i.cm} cm`)}
      ${fact('Typical lifespan (female)', i.life)}
      ${fact('Origin', i.origin)}
      ${fact('Temperature', i.temp)}
      ${fact('Humidity', i.rh)}
      ${fact('Set-up', i.setup)}
      ${fact('Feeding', i.diet, true)}
    </dl>
    ${caution}
    <p class="fine">General guidance with rounded, approximate ranges that I have not checked against sources. Always research your species and ask experienced keepers.</p>`;
}
