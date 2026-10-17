/* 아리채 오락실 - 동물 캐릭터 20종 (SVG로 직접 그림) */
(function () {
  'use strict';

  const LIST = [
    ['cat', '고양이'], ['dog', '강아지'], ['rabbit', '토끼'], ['bear', '곰'], ['panda', '판다'],
    ['fox', '여우'], ['raccoon', '너구리'], ['koala', '코알라'], ['hamster', '햄스터'], ['penguin', '펭귄'],
    ['chick', '병아리'], ['owl', '부엉이'], ['frog', '개구리'], ['pig', '돼지'], ['monkey', '원숭이'],
    ['lion', '사자'], ['tiger', '호랑이'], ['sheep', '양'], ['mouse', '쥐'], ['otter', '수달']
  ];

  const SPEC = {
    cat:     { face: '#F5A65B', inner: '#FFD3B0', muzzle: '#FFEBD9', nose: '#E85D75', f: ['pointy', 'muzzle', 'nose', 'mouth', 'whiskers', 'blush'] },
    dog:     { face: '#EBCB9F', ear: '#9C6B45', muzzle: '#FFF4E6', f: ['floppy', 'muzzle', 'noseBig', 'mouth', 'blush'] },
    rabbit:  { face: '#F7F3FF', inner: '#FFB3C7', nose: '#FF7FA0', f: ['long', 'nose', 'mouth', 'blush'] },
    bear:    { face: '#A86B45', inner: '#E3B48C', muzzle: '#E9C4A0', f: ['round', 'muzzle', 'noseBig', 'mouth'] },
    panda:   { face: '#FAFAFA', ear: '#2B2D42', inner: '#2B2D42', dark: '#2B2D42', f: ['round', 'panda', 'noseBig', 'mouth', 'blush'] },
    fox:     { face: '#FF8A3D', inner: '#FFF1E6', muzzle: '#FFF1E6', f: ['pointy', 'muzzleWide', 'noseBig', 'mouth'] },
    raccoon: { face: '#9AA0A8', inner: '#3A3F4B', dark: '#3A3F4B', muzzle: '#F2F2F2', f: ['small', 'raccoon', 'muzzle', 'noseBig', 'mouth'] },
    koala:   { face: '#A9B3BF', inner: '#F1E8F0', f: ['big', 'koala', 'blush'] },
    hamster: { face: '#F2B880', inner: '#FFD9DE', muzzle: '#FFF5EA', nose: '#FF7FA0', f: ['small', 'cheeks', 'nose', 'mouth', 'blush'] },
    penguin: { face: '#2F3550', mask: '#FFFFFF', f: ['mask', 'beak', 'blush'] },
    chick:   { face: '#FFD23F', dark: '#E0A800', f: ['tuft', 'beak', 'blush'] },
    owl:     { face: '#9B6B43', ear: '#9B6B43', mask: '#F1DEC4', f: ['tufts', 'owlMask', 'owlEyes', 'beak'] },
    frog:    { face: '#6FD36F', f: ['frog', 'mouthWide', 'blush'] },
    pig:     { face: '#FFB3C1', inner: '#FF8FA6', f: ['pointy', 'pig', 'blush'] },
    monkey:  { face: '#A0663F', inner: '#F5D0AE', mask: '#F5D0AE', nose: '#6B3F22', f: ['side', 'mask', 'nose', 'mouth'] },
    lion:    { face: '#F7C35F', inner: '#E9A23B', mane: '#C8661F', maneIn: '#E58A2E', muzzle: '#FFF0D0', f: ['mane', 'small', 'muzzle', 'noseBig', 'mouth'] },
    tiger:   { face: '#FF9F43', inner: '#FFF5E6', dark: '#3A2A1A', muzzle: '#FFF5E6', f: ['round', 'stripes', 'muzzle', 'noseBig', 'mouth', 'whiskers'] },
    sheep:   { face: '#F6E3D2', ear: '#E9CDB4', wool: '#FFFFFF', nose: '#C98B6B', f: ['floppy', 'wool', 'nose', 'mouth', 'blush'] },
    mouse:   { face: '#B8B8C8', inner: '#FFC0CF', nose: '#FF7FA0', f: ['big', 'nose', 'whiskers', 'mouth', 'blush'] },
    otter:   { face: '#8A5A3C', inner: '#E9CDB0', muzzle: '#E9CDB0', f: ['small', 'muzzle', 'noseBig', 'whiskers', 'mouth'] }
  };

  const cache = {};

  function build(kind) {
    const s = SPEC[kind] || SPEC.rabbit;
    const f = new Set(s.f);
    if (!f.has('frog') && !f.has('owlEyes')) f.add('eyes');
    const c = {
      face: s.face,
      ear: s.ear || s.face,
      inner: s.inner || '#FFC9D6',
      muzzle: s.muzzle || '#FFF3E6',
      dark: s.dark || '#2B2D42',
      mask: s.mask || '#FFFFFF',
      wool: s.wool || '#FFFFFF',
      mane: s.mane || '#C8661F',
      maneIn: s.maneIn || '#E58A2E',
      nose: s.nose || '#2A1E1A'
    };
    const p = [];
    const D = '#1C1733';

    if (f.has('mane')) p.push(`<circle cx="50" cy="56" r="47" fill="${c.mane}"/><circle cx="50" cy="56" r="40" fill="${c.maneIn}"/>`);
    if (f.has('pointy')) p.push(
      `<path d="M20 46 L24 10 L48 26 Z" fill="${c.ear}" stroke="${c.ear}" stroke-width="6" stroke-linejoin="round"/>` +
      `<path d="M80 46 L76 10 L52 26 Z" fill="${c.ear}" stroke="${c.ear}" stroke-width="6" stroke-linejoin="round"/>` +
      `<path d="M27 37 L28.5 19 L40 27 Z" fill="${c.inner}" stroke="${c.inner}" stroke-width="3" stroke-linejoin="round"/>` +
      `<path d="M73 37 L71.5 19 L60 27 Z" fill="${c.inner}" stroke="${c.inner}" stroke-width="3" stroke-linejoin="round"/>`);
    if (f.has('round')) p.push(`<circle cx="25" cy="28" r="13" fill="${c.ear}"/><circle cx="75" cy="28" r="13" fill="${c.ear}"/><circle cx="25" cy="28" r="7" fill="${c.inner}"/><circle cx="75" cy="28" r="7" fill="${c.inner}"/>`);
    if (f.has('small')) p.push(`<circle cx="29" cy="27" r="9" fill="${c.ear}"/><circle cx="71" cy="27" r="9" fill="${c.ear}"/><circle cx="29" cy="27" r="5" fill="${c.inner}"/><circle cx="71" cy="27" r="5" fill="${c.inner}"/>`);
    if (f.has('big')) p.push(`<circle cx="19" cy="35" r="19" fill="${c.ear}"/><circle cx="81" cy="35" r="19" fill="${c.ear}"/><circle cx="20" cy="36" r="11" fill="${c.inner}"/><circle cx="80" cy="36" r="11" fill="${c.inner}"/>`);
    if (f.has('side')) p.push(`<circle cx="15" cy="57" r="12" fill="${c.ear}"/><circle cx="85" cy="57" r="12" fill="${c.ear}"/><circle cx="15" cy="57" r="6" fill="${c.inner}"/><circle cx="85" cy="57" r="6" fill="${c.inner}"/>`);
    if (f.has('long')) p.push(`<ellipse cx="37" cy="19" rx="9" ry="24" fill="${c.ear}"/><ellipse cx="63" cy="19" rx="9" ry="24" fill="${c.ear}"/><ellipse cx="37" cy="21" rx="4.5" ry="17" fill="${c.inner}"/><ellipse cx="63" cy="21" rx="4.5" ry="17" fill="${c.inner}"/>`);
    if (f.has('tufts')) p.push(`<path d="M22 36 L20 12 L40 27 Z" fill="${c.ear}" stroke="${c.ear}" stroke-width="4" stroke-linejoin="round"/><path d="M78 36 L80 12 L60 27 Z" fill="${c.ear}" stroke="${c.ear}" stroke-width="4" stroke-linejoin="round"/>`);
    if (f.has('tuft')) p.push(`<path d="M50 24 Q45 14 49 8" fill="none" stroke="${c.dark}" stroke-width="4" stroke-linecap="round"/><path d="M51 24 Q56 15 61 14" fill="none" stroke="${c.dark}" stroke-width="4" stroke-linecap="round"/>`);

    p.push(`<circle cx="50" cy="56" r="34" fill="${c.face}"/>`);

    if (f.has('floppy')) p.push(`<ellipse cx="20" cy="52" rx="11" ry="20" fill="${c.ear}" transform="rotate(18 20 52)"/><ellipse cx="80" cy="52" rx="11" ry="20" fill="${c.ear}" transform="rotate(-18 80 52)"/>`);
    if (f.has('wool')) p.push(`<circle cx="28" cy="31" r="11" fill="${c.wool}"/><circle cx="39" cy="24" r="11" fill="${c.wool}"/><circle cx="51" cy="21" r="11" fill="${c.wool}"/><circle cx="63" cy="23" r="11" fill="${c.wool}"/><circle cx="73" cy="30" r="11" fill="${c.wool}"/>`);
    if (f.has('mask')) p.push(`<circle cx="40" cy="56" r="15" fill="${c.mask}"/><circle cx="60" cy="56" r="15" fill="${c.mask}"/><ellipse cx="50" cy="70" rx="21" ry="15" fill="${c.mask}"/>`);
    if (f.has('owlMask')) p.push(`<circle cx="37" cy="54" r="14" fill="${c.mask}"/><circle cx="63" cy="54" r="14" fill="${c.mask}"/>`);
    if (f.has('muzzleWide')) p.push(`<ellipse cx="50" cy="73" rx="25" ry="15" fill="${c.muzzle}"/>`);
    if (f.has('cheeks')) p.push(`<circle cx="31" cy="68" r="11" fill="${c.muzzle}"/><circle cx="69" cy="68" r="11" fill="${c.muzzle}"/>`);
    if (f.has('panda')) p.push(`<ellipse cx="37" cy="55" rx="8" ry="10.5" fill="${c.dark}" transform="rotate(-25 37 55)"/><ellipse cx="63" cy="55" rx="8" ry="10.5" fill="${c.dark}" transform="rotate(25 63 55)"/>`);
    if (f.has('raccoon')) p.push(`<ellipse cx="50" cy="54" rx="29" ry="9" fill="${c.dark}"/>`);
    if (f.has('stripes')) p.push(`<g stroke="${c.dark}" stroke-width="4" stroke-linecap="round"><path d="M50 25 L50 34"/><path d="M40 27 L43 35"/><path d="M60 27 L57 35"/><path d="M17 52 L27 54"/><path d="M83 52 L73 54"/><path d="M18 61 L27 61"/><path d="M82 61 L73 61"/></g>`);
    if (f.has('muzzle')) p.push(`<ellipse cx="50" cy="68" rx="15" ry="11" fill="${c.muzzle}"/>`);
    if (f.has('eyes')) p.push(`<circle class="eye" cx="38" cy="54" r="4.4" fill="${D}"/><circle class="eye" cx="62" cy="54" r="4.4" fill="${D}"/><circle cx="39.6" cy="52.4" r="1.5" fill="#fff"/><circle cx="63.6" cy="52.4" r="1.5" fill="#fff"/>`);
    if (f.has('owlEyes')) p.push(`<circle cx="37" cy="54" r="9" fill="#fff"/><circle cx="63" cy="54" r="9" fill="#fff"/><circle class="eye" cx="38" cy="55" r="5" fill="${D}"/><circle class="eye" cx="62" cy="55" r="5" fill="${D}"/><circle cx="39.6" cy="53.4" r="1.6" fill="#fff"/><circle cx="63.6" cy="53.4" r="1.6" fill="#fff"/>`);
    if (f.has('frog')) p.push(`<circle cx="33" cy="29" r="13" fill="${c.face}"/><circle cx="67" cy="29" r="13" fill="${c.face}"/><circle cx="33" cy="28" r="8.5" fill="#fff"/><circle cx="67" cy="28" r="8.5" fill="#fff"/><circle class="eye" cx="34" cy="29" r="4.6" fill="${D}"/><circle class="eye" cx="66" cy="29" r="4.6" fill="${D}"/><circle cx="35.4" cy="27.4" r="1.5" fill="#fff"/><circle cx="67.4" cy="27.4" r="1.5" fill="#fff"/>`);
    if (f.has('blush')) p.push(`<ellipse cx="27" cy="66" rx="6" ry="3.5" fill="#FF7FA0" opacity="0.55"/><ellipse cx="73" cy="66" rx="6" ry="3.5" fill="#FF7FA0" opacity="0.55"/>`);
    if (f.has('whiskers')) p.push(`<g stroke="${D}" stroke-opacity="0.45" stroke-width="1.8" stroke-linecap="round"><path d="M31 66 L15 62"/><path d="M31 70 L15 73"/><path d="M69 66 L85 62"/><path d="M69 70 L85 73"/></g>`);
    if (f.has('nose')) p.push(`<ellipse cx="50" cy="63" rx="3.4" ry="2.5" fill="${c.nose}"/>`);
    if (f.has('noseBig')) p.push(`<path d="M43.5 61.5 Q50 57.5 56.5 61.5 Q50 69 43.5 61.5 Z" fill="#2A1E1A"/>`);
    if (f.has('koala')) p.push(`<ellipse cx="50" cy="63" rx="7.5" ry="9.5" fill="#3A3F4B"/>`);
    if (f.has('pig')) p.push(`<ellipse cx="50" cy="67" rx="11" ry="8" fill="${c.inner}"/><ellipse cx="46" cy="67" rx="2" ry="3" fill="#B8456A"/><ellipse cx="54" cy="67" rx="2" ry="3" fill="#B8456A"/>`);
    if (f.has('beak')) p.push(`<path d="M44 62 L56 62 L50 71 Z" fill="#FF9F1C" stroke="#FF9F1C" stroke-width="3" stroke-linejoin="round"/>`);
    if (f.has('mouth')) p.push(`<path d="M44.5 69.5 Q47.5 73.5 50 69.5 Q52.5 73.5 55.5 69.5" fill="none" stroke="${D}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`);
    if (f.has('mouthWide')) p.push(`<path d="M35 68 Q50 81 65 68" fill="none" stroke="${D}" stroke-width="2.6" stroke-linecap="round"/>`);

    return p.join('');
  }

  function svg(kind, size) {
    if (!cache[kind]) cache[kind] = build(kind);
    const s = size ? `width="${size}" height="${size}"` : 'width="100%" height="100%"';
    return `<svg class="animal" viewBox="0 0 100 100" ${s} aria-hidden="true">${cache[kind]}</svg>`;
  }

  function name(kind) {
    const hit = LIST.find((x) => x[0] === kind);
    return hit ? hit[1] : '';
  }

  window.Animals = { LIST, svg, name };
})();
