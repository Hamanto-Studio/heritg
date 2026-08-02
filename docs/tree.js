const familyPeople = [
  { id: 'madirono', name: 'Kyai Haji Madirono', gender: 'male', initials: 'HM', x: 520, y: 150 },
  { id: 'aminah', name: 'Nyai Haji Siti Aminah', gender: 'female', initials: 'SA', x: 780, y: 150 },
  { id: 'ngasirah', name: 'Mas Ayu Ngasirah', gender: 'female', initials: 'MN', x: 390, y: 410 },
  { id: 'sosroningrat', name: 'R.M.A.A. Sosroningrat', gender: 'male', image: 'sosroningrat.jpg', x: 650, y: 410 },
  { id: 'moerjam', name: 'R.A. Moerjam', gender: 'female', initials: 'RM', x: 910, y: 410 },
  { id: 'kartini', name: 'R.A. Kartini', gender: 'female', image: 'kartini.jpg', birthDate: '1879-04-21', deathDate: '1904-09-17', x: 260, y: 670 },
  { id: 'djojoadiningrat', name: 'R.A.A. Djojoadiningrat', gender: 'male', initials: 'DJ', x: 520, y: 670 },
  { id: 'kardinah', name: 'R.A. Kardinah', gender: 'female', image: 'kardinah.jpg', birthDate: '1881-03-01', deathDate: '1971-07-05', x: 780, y: 670 },
  { id: 'roekmini', name: 'R.A. Roekmini', gender: 'female', image: 'roekmini.jpg', x: 1040, y: 670 },
  { id: 'soesalit', name: 'R.M. Soesalit Djojoadhiningrat', gender: 'male', image: 'soesalit.jpg', birthDate: '1904-09-13', deathDate: '1962-03-17', x: 650, y: 930 },
  { id: 'boedhy', name: 'Boedhy Setia Soesalit', gender: 'male', initials: 'BS', x: 650, y: 1190 },
];

const familyRelationships = [
  { kind: 'parent', from: 'madirono', to: 'ngasirah' },
  { kind: 'parent', from: 'aminah', to: 'ngasirah' },
  { kind: 'parent', from: 'sosroningrat', to: 'kartini' },
  { kind: 'parent', from: 'ngasirah', to: 'kartini' },
  { kind: 'parent', from: 'sosroningrat', to: 'kardinah' },
  { kind: 'parent', from: 'ngasirah', to: 'kardinah' },
  { kind: 'parent', from: 'sosroningrat', to: 'roekmini' },
  { kind: 'parent', from: 'moerjam', to: 'roekmini' },
  { kind: 'parent', from: 'kartini', to: 'soesalit' },
  { kind: 'parent', from: 'djojoadiningrat', to: 'soesalit' },
  { kind: 'parent', from: 'soesalit', to: 'boedhy' },
  { kind: 'partner', subtype: 'spouse', from: 'ngasirah', to: 'sosroningrat' },
  { kind: 'partner', subtype: 'spouse', from: 'sosroningrat', to: 'moerjam' },
  { kind: 'partner', subtype: 'spouse', marriageYear: 1903, from: 'kartini', to: 'djojoadiningrat' },
];

const treeCopy = {
  en: {
    you: 'You', father: 'Father', mother: 'Mother', son: 'Son', daughter: 'Daughter',
    husband: 'Husband', wife: 'Wife', brother: 'Brother', sister: 'Sister',
    halfBrother: 'Half-brother', halfSister: 'Half-sister', grandfather: 'Grandfather',
    grandmother: 'Grandmother', grandson: 'Grandson', granddaughter: 'Granddaughter',
    greatGrandfather: 'Great-grandfather', greatGrandmother: 'Great-grandmother', greatGrandson: 'Great-grandson', greatGranddaughter: 'Great-granddaughter',
    stepfather: 'Stepfather', stepmother: 'Stepmother', stepson: 'Stepson', stepdaughter: 'Stepdaughter',
    fatherInLaw: 'Father-in-law', motherInLaw: 'Mother-in-law', sonInLaw: 'Son-in-law', daughterInLaw: 'Daughter-in-law',
    ancestor: 'Ancestor', descendant: 'Descendant', family: 'Family member', married: 'Married', partner: 'Partner',
    focused: 'Focused on', age: 'age',
  },
  id: {
    you: 'Anda', father: 'Ayah', mother: 'Ibu', son: 'Anak laki-laki', daughter: 'Anak perempuan',
    husband: 'Suami', wife: 'Istri', brother: 'Saudara laki-laki', sister: 'Saudara perempuan',
    halfBrother: 'Saudara laki-laki seayah atau seibu', halfSister: 'Saudara perempuan seayah atau seibu',
    grandfather: 'Kakek', grandmother: 'Nenek', grandson: 'Cucu laki-laki', granddaughter: 'Cucu perempuan',
    greatGrandfather: 'Kakek buyut', greatGrandmother: 'Nenek buyut', greatGrandson: 'Cicit laki-laki', greatGranddaughter: 'Cicit perempuan',
    stepfather: 'Ayah tiri', stepmother: 'Ibu tiri', stepson: 'Anak tiri laki-laki', stepdaughter: 'Anak tiri perempuan',
    fatherInLaw: 'Ayah mertua', motherInLaw: 'Ibu mertua', sonInLaw: 'Menantu laki-laki', daughterInLaw: 'Menantu perempuan',
    ancestor: 'Leluhur', descendant: 'Keturunan', family: 'Anggota keluarga', married: 'Menikah', partner: 'Pasangan',
    focused: 'Berfokus pada', age: 'usia',
  },
};

const personByID = new Map(familyPeople.map((person) => [person.id, person]));
const parentsOf = (id) => familyRelationships.filter((item) => item.kind === 'parent' && item.to === id).map((item) => item.from);
const childrenOf = (id) => familyRelationships.filter((item) => item.kind === 'parent' && item.from === id).map((item) => item.to);
const partnersOf = (id) => familyRelationships.filter((item) => item.kind === 'partner' && [item.from, item.to].includes(id)).map((item) => item.from === id ? item.to : item.from);

function directedDistance(start, target, next) {
  const queue = [{ id: start, distance: 0 }];
  const seen = new Set([start]);
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (current.id === target) return current.distance;
    next(current.id).forEach((id) => {
      if (!seen.has(id)) { seen.add(id); queue.push({ id, distance: current.distance + 1 }); }
    });
  }
  return null;
}

function relationshipLabel(focusID, personID, locale) {
  const copy = treeCopy[locale];
  const person = personByID.get(personID);
  const gendered = (male, female) => person.gender === 'female' ? female : male;
  if (focusID === personID) return copy.you;
  if (parentsOf(focusID).includes(personID)) return gendered(copy.father, copy.mother);
  if (childrenOf(focusID).includes(personID)) return gendered(copy.son, copy.daughter);
  if (partnersOf(focusID).includes(personID)) return gendered(copy.husband, copy.wife);

  const focusParents = parentsOf(focusID);
  const personParents = parentsOf(personID);
  const sharedParents = focusParents.filter((id) => personParents.includes(id));
  if (sharedParents.length) {
    return sharedParents.length === focusParents.length && sharedParents.length === personParents.length
      ? gendered(copy.brother, copy.sister)
      : gendered(copy.halfBrother, copy.halfSister);
  }
  if (focusParents.some((parent) => parentsOf(parent).includes(personID))) return gendered(copy.grandfather, copy.grandmother);
  if (childrenOf(focusID).some((child) => childrenOf(child).includes(personID))) return gendered(copy.grandson, copy.granddaughter);
  if (focusParents.some((parent) => partnersOf(parent).includes(personID)) && !focusParents.includes(personID)) return gendered(copy.stepfather, copy.stepmother);
  if (partnersOf(focusID).some((partner) => childrenOf(partner).includes(personID)) && !childrenOf(focusID).includes(personID)) return gendered(copy.stepson, copy.stepdaughter);
  if (partnersOf(focusID).some((partner) => parentsOf(partner).includes(personID))) return gendered(copy.fatherInLaw, copy.motherInLaw);
  if (childrenOf(focusID).some((child) => partnersOf(child).includes(personID))) return gendered(copy.sonInLaw, copy.daughterInLaw);

  const ancestorDistance = directedDistance(focusID, personID, parentsOf);
  const descendantDistance = directedDistance(focusID, personID, childrenOf);
  if (ancestorDistance === 3) return gendered(copy.greatGrandfather, copy.greatGrandmother);
  if (descendantDistance === 3) return gendered(copy.greatGrandson, copy.greatGranddaughter);
  if (ancestorDistance > 2) return copy.ancestor;
  if (descendantDistance > 2) return copy.descendant;
  return copy.family;
}

function lifeSummary(person, locale) {
  if (!person.birthDate || !person.deathDate) return '';
  const [birthYear, birthMonth, birthDay] = person.birthDate.split('-').map(Number);
  const [deathYear, deathMonth, deathDay] = person.deathDate.split('-').map(Number);
  let age = deathYear - birthYear;
  if (deathMonth < birthMonth || (deathMonth === birthMonth && deathDay < birthDay)) age -= 1;
  return `${birthYear}-${deathYear} · ${treeCopy[locale].age} ${age}`;
}

const orientation = (segment) => segment.start.x === segment.end.x ? 'vertical' : 'horizontal';
const rangesOverlap = (firstStart, firstEnd, secondStart, secondEnd) => Math.max(Math.min(firstStart, firstEnd), Math.min(secondStart, secondEnd)) < Math.min(Math.max(firstStart, firstEnd), Math.max(secondStart, secondEnd));

function separateVerticalChannels(families) {
  const fixedDrops = families.flatMap((family) => family.segments
    .filter((segment) => segment.kind === 'parent-drop' || segment.kind === 'child-drop')
    .map((segment) => ({ ...segment, familyID: family.id })));
  const occupiedTrunks = [];
  families.forEach((family) => {
    const trunk = family.segments.find((segment) => segment.kind === 'trunk');
    if (!trunk) return;
    const childCenter = family.childIDs.reduce((sum, id) => sum + personByID.get(id).x, 0) / family.childIDs.length;
    const direction = childCenter >= trunk.start.x ? 1 : -1;
    const offsets = [0];
    for (let step = 1; step <= 40; step += 1) offsets.push(direction * step * 6, direction * step * -6);
    const obstacles = [...fixedDrops, ...occupiedTrunks];
    const offset = offsets.find((candidate) => !obstacles.some((other) => {
      if (other.familyID === family.id) return false;
      const minimumGap = other.kind === 'child-drop' || other.kind === 'trunk' ? 96 : 24;
      return Math.abs(other.start.x - trunk.start.x - candidate) < minimumGap
        && rangesOverlap(trunk.start.y, trunk.end.y, other.start.y, other.end.y);
    })) || 0;
    const trunkX = trunk.start.x + offset;
    trunk.start.x = trunkX;
    trunk.end.x = trunkX;
    const parentXs = family.parentIDs.map((id) => family.ports.get(id));
    const childXs = family.childIDs.map((id) => personByID.get(id).x);
    const parentRail = family.segments.find((segment) => segment.kind === 'parent-rail');
    const childRail = family.segments.find((segment) => segment.kind === 'child-rail');
    if (parentRail) {
      parentRail.start.x = Math.min(...parentXs, trunkX);
      parentRail.end.x = Math.max(...parentXs, trunkX);
    }
    if (childRail) {
      childRail.start.x = Math.min(...childXs, trunkX);
      childRail.end.x = Math.max(...childXs, trunkX);
    }
    family.junctions = [{ x: trunkX, y: trunk.start.y }, { x: trunkX, y: trunk.end.y }];
    occupiedTrunks.push({ ...trunk, familyID: family.id });
  });
}

function crossingPoints(families) {
  const points = [];
  families.forEach((first, firstIndex) => families.slice(firstIndex + 1).forEach((second) => {
    first.segments.forEach((one) => second.segments.forEach((two) => {
      const horizontal = orientation(one) === 'horizontal' ? one : orientation(two) === 'horizontal' ? two : null;
      const vertical = orientation(one) === 'vertical' ? one : orientation(two) === 'vertical' ? two : null;
      if (!horizontal || !vertical) return;
      const x = vertical.start.x;
      const y = horizontal.start.y;
      if (x >= Math.min(horizontal.start.x, horizontal.end.x) && x <= Math.max(horizontal.start.x, horizontal.end.x)
        && y >= Math.min(vertical.start.y, vertical.end.y) && y <= Math.max(vertical.start.y, vertical.end.y)
        && !points.some((point) => point.x === x && point.y === y)) points.push({ x, y });
    }));
  }));
  return points;
}

function buildFamilyRoutes(locale) {
  const grouped = new Map();
  const parentsByChild = new Map();
  familyRelationships.filter((item) => item.kind === 'parent').forEach((edge) => {
    parentsByChild.set(edge.to, [...new Set([...(parentsByChild.get(edge.to) || []), edge.from])].sort());
  });
  parentsByChild.forEach((parentIDs, childID) => {
    const key = parentIDs.join('|');
    grouped.set(key, { id: key, parentIDs, childIDs: [...(grouped.get(key)?.childIDs || []), childID] });
  });
  const families = [...grouped.values()].map((family) => {
    family.parentIDs.sort((a, b) => personByID.get(a).x - personByID.get(b).x);
    family.childIDs.sort((a, b) => personByID.get(a).x - personByID.get(b).x);
    const people = [...family.parentIDs, ...family.childIDs].map((id) => personByID.get(id));
    return { ...family, minX: Math.min(...people.map((person) => person.x)), maxX: Math.max(...people.map((person) => person.x)), lane: 0, laneCount: 1, ports: new Map() };
  });
  const bands = new Map();
  families.forEach((family) => {
    const key = `${personByID.get(family.parentIDs[0]).y}:${personByID.get(family.childIDs[0]).y}`;
    bands.set(key, [...(bands.get(key) || []), family]);
  });
  bands.forEach((band) => {
    const laneEnds = [];
    band.sort((a, b) => a.minX - b.minX || a.maxX - b.maxX || a.id.localeCompare(b.id)).forEach((family) => {
      family.lane = laneEnds.findIndex((end) => end + 20 < family.minX);
      if (family.lane < 0) family.lane = laneEnds.length;
      laneEnds[family.lane] = family.maxX;
    });
    band.forEach((family) => { family.laneCount = laneEnds.length; });
  });
  const byParent = new Map();
  families.forEach((family) => family.parentIDs.forEach((id) => byParent.set(id, [...(byParent.get(id) || []), family])));
  byParent.forEach((parentFamilies, parentID) => parentFamilies.sort((a, b) => {
    const childCenter = (family) => family.childIDs.reduce((sum, id) => sum + personByID.get(id).x, 0) / family.childIDs.length;
    return childCenter(a) - childCenter(b) || a.id.localeCompare(b.id);
  }).forEach((family, index) => {
    const portSpacing = parentFamilies.length > 1 ? Math.min(40, 56 / (parentFamilies.length - 1)) : 0;
    family.ports.set(parentID, personByID.get(parentID).x + (index - (parentFamilies.length - 1) / 2) * portSpacing);
  }));
  families.forEach((family) => {
    const parentStartY = Math.max(...family.parentIDs.map((id) => personByID.get(id).y + (lifeSummary(personByID.get(id), locale) ? 100 : 84)));
    const childTopY = Math.min(...family.childIDs.map((id) => personByID.get(id).y - 32));
    const availableHeight = Math.max(childTopY - parentStartY - 32, 0);
    const spacing = family.laneCount > 1 ? Math.max(2, Math.min(12, availableHeight / ((family.laneCount - 1) * 2))) : 0;
    const parentJoinY = parentStartY + 8 + family.lane * spacing;
    const childRailY = childTopY - 8 - (family.laneCount - 1 - family.lane) * spacing;
    const parentXs = family.parentIDs.map((id) => family.ports.get(id));
    const childXs = family.childIDs.map((id) => personByID.get(id).x);
    const trunkX = parentXs.reduce((sum, x) => sum + x, 0) / parentXs.length + (family.lane - (family.laneCount - 1) / 2) * 8;
    family.segments = [
      ...family.parentIDs.map((id, index) => ({ kind: 'parent-drop', start: { x: parentXs[index], y: personByID.get(id).y + (lifeSummary(personByID.get(id), locale) ? 100 : 84) }, end: { x: parentXs[index], y: parentJoinY } })),
      { kind: 'parent-rail', start: { x: Math.min(...parentXs, trunkX), y: parentJoinY }, end: { x: Math.max(...parentXs, trunkX), y: parentJoinY } },
      { kind: 'trunk', start: { x: trunkX, y: parentJoinY }, end: { x: trunkX, y: childRailY } },
      { kind: 'child-rail', start: { x: Math.min(...childXs, trunkX), y: childRailY }, end: { x: Math.max(...childXs, trunkX), y: childRailY } },
      ...family.childIDs.map((id) => ({ kind: 'child-drop', start: { x: personByID.get(id).x, y: childRailY }, end: { x: personByID.get(id).x, y: personByID.get(id).y - 32 } })),
    ].filter((segment) => segment.start.x !== segment.end.x || segment.start.y !== segment.end.y);
    family.junctions = [{ x: trunkX, y: parentJoinY }, { x: trunkX, y: childRailY }];
  });
  families.sort((a, b) => a.id.localeCompare(b.id));
  separateVerticalChannels(families);
  return { families, crossings: crossingPoints(families) };
}

function setupFamilyTree(root) {
  const locale = root.dataset.treeLocale === 'en' ? 'en' : 'id';
  const assetPrefix = root.dataset.treeAssets || 'assets';
  const viewport = root.querySelector('[data-tree-viewport]');
  const stage = root.querySelector('[data-tree-stage]');
  const svg = root.querySelector('[data-tree-connectors]');
  const nodeLayer = root.querySelector('[data-tree-nodes]');
  const status = root.querySelector('[data-tree-status]');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stageWidth = 1300;
  const stageHeight = 1420;
  let focusID = 'sosroningrat';
  let scale = viewport.clientWidth < 700 ? .85 : .95;
  let panX = 0;
  let panY = 0;
  let wheelZoomEnabled = false;
  let suppressClick = false;
  let settleTimer;

  Object.assign(stage.style, { width: `${stageWidth}px`, height: `${stageHeight}px` });
  svg.setAttribute('width', stageWidth);
  svg.setAttribute('height', stageHeight);
  const svgNS = 'http://www.w3.org/2000/svg';
  let drawIndex = 0;
  const drawLine = (start, end, className) => {
    const line = document.createElementNS(svgNS, 'line');
    Object.entries({ x1: start.x, y1: start.y, x2: end.x, y2: end.y }).forEach(([key, value]) => line.setAttribute(key, value));
    line.setAttribute('class', `${className} tree-line-draw`);
    line.setAttribute('pathLength', '1');
    line.style.setProperty('--draw-delay', `${Math.min(drawIndex * 24, 420)}ms`);
    drawIndex += 1;
    svg.append(line);
  };
  const drawCircle = (point, className, radius) => {
    const circle = document.createElementNS(svgNS, 'circle');
    Object.entries({ cx: point.x, cy: point.y, r: radius }).forEach(([key, value]) => circle.setAttribute(key, value));
    circle.setAttribute('class', className);
    svg.append(circle);
  };
  const routes = buildFamilyRoutes(locale);
  routes.families.forEach((family) => {
    family.segments.forEach((segment) => drawLine(segment.start, segment.end, 'family-connector'));
    family.junctions.forEach((junction) => drawCircle(junction, 'family-junction', 3.25));
  });
  routes.crossings.forEach((point) => {
    drawCircle(point, 'crossing-knockout', 6);
    drawLine({ x: point.x, y: point.y - 7 }, { x: point.x, y: point.y + 7 }, 'crossing-bridge');
  });
  const unionDescriptions = [];
  familyRelationships.filter((item) => item.kind === 'partner').forEach((edge) => {
    const first = personByID.get(edge.from);
    const second = personByID.get(edge.to);
    const left = first.x < second.x ? first : second;
    const right = first.x < second.x ? second : first;
    drawLine({ x: left.x + 32, y: left.y }, { x: right.x - 32, y: right.y }, 'partner-connector');
    const labelText = `${edge.subtype === 'spouse' ? treeCopy[locale].married : treeCopy[locale].partner}${edge.marriageYear ? ` ${edge.marriageYear}` : ''}`;
    unionDescriptions.push(`${first.name} ${locale === 'id' ? 'dan' : 'and'} ${second.name}: ${labelText}`);
    const group = document.createElementNS(svgNS, 'g');
    group.setAttribute('class', 'partner-badge');
    const width = labelText.length * 6.5 + 18;
    const centerX = (left.x + right.x) / 2;
    const rect = document.createElementNS(svgNS, 'rect');
    Object.entries({ x: centerX - width / 2, y: left.y - 28, width, height: 20, rx: 10 }).forEach(([key, value]) => rect.setAttribute(key, value));
    const text = document.createElementNS(svgNS, 'text');
    Object.entries({ x: centerX, y: left.y - 14 }).forEach(([key, value]) => text.setAttribute(key, value));
    text.textContent = labelText;
    group.append(rect, text);
    svg.append(group);
  });
  const relationshipSummary = document.createElement('p');
  relationshipSummary.className = 'visually-hidden';
  relationshipSummary.textContent = unionDescriptions.join('. ');
  root.append(relationshipSummary);

  const applyTransform = (animate = false) => {
    clearTimeout(settleTimer);
    stage.classList.toggle('is-settling', animate && !reducedMotion);
    stage.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    if (animate) settleTimer = setTimeout(() => stage.classList.remove('is-settling'), 450);
  };
  const centerPerson = (person, animate = false) => {
    panX = viewport.clientWidth / 2 - person.x * scale;
    const targetY = viewport.clientWidth >= 700 ? viewport.clientHeight * .45 : viewport.clientHeight * .46;
    panY = targetY - person.y * scale;
    applyTransform(animate);
  };
  const centerFocus = (animate = false) => centerPerson(personByID.get(focusID), animate);
  const renderNodes = () => {
    nodeLayer.replaceChildren();
    familyPeople.forEach((person) => {
      const roleText = relationshipLabel(focusID, person.id, locale);
      const lifeText = lifeSummary(person, locale);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `web-tree-node${person.id === focusID ? ' selected' : ''}`;
      button.style.left = `${person.x}px`;
      button.style.top = `${person.y}px`;
      button.tabIndex = 0;
      button.setAttribute('aria-pressed', String(person.id === focusID));
      button.setAttribute('aria-label', [person.name, roleText, lifeText].filter(Boolean).join(', '));
      const avatar = person.image
        ? Object.assign(document.createElement('img'), { className: 'node-avatar', src: `${assetPrefix}/${person.image}`, alt: '', width: 64, height: 64, loading: 'lazy', decoding: 'async' })
        : Object.assign(document.createElement('span'), { className: 'node-avatar', textContent: person.initials });
      const name = Object.assign(document.createElement('strong'), { textContent: person.name });
      if (person.name.length > 28) name.classList.add('compact');
      const role = Object.assign(document.createElement('small'), { textContent: roleText });
      button.append(avatar, name, role);
      if (lifeText) button.append(Object.assign(document.createElement('span'), { className: 'node-life', textContent: lifeText }));
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        if (suppressClick) { suppressClick = false; return; }
        focusID = person.id;
        wheelZoomEnabled = true;
        status.textContent = `${treeCopy[locale].focused} ${person.name}`;
        renderNodes();
        nodeLayer.querySelector('.selected')?.focus({ preventScroll: true });
        scale = Math.max(scale, .9);
        centerFocus(true);
      });
      button.addEventListener('focus', () => {
        if (button.matches(':focus-visible')) centerPerson(person, true);
      });
      nodeLayer.append(button);
    });
  };
  const fit = () => {
    const bounds = { minX: 70, maxX: 1230, minY: 50, maxY: 1320 };
    scale = Math.max(.24, Math.min(1.25, Math.min((viewport.clientWidth - 48) / (bounds.maxX - bounds.minX), (viewport.clientHeight - 48) / (bounds.maxY - bounds.minY))));
    panX = viewport.clientWidth / 2 - ((bounds.minX + bounds.maxX) / 2) * scale;
    panY = viewport.clientHeight / 2 - ((bounds.minY + bounds.maxY) / 2) * scale;
    applyTransform(true);
  };
  const zoomAround = (nextScale, clientX, clientY) => {
    const rect = viewport.getBoundingClientRect();
    const anchorX = clientX - rect.left;
    const anchorY = clientY - rect.top;
    const clamped = Math.max(.24, Math.min(1.8, nextScale));
    const factor = clamped / scale;
    panX = panX * factor + anchorX * (1 - factor);
    panY = panY * factor + anchorY * (1 - factor);
    scale = clamped;
    applyTransform();
  };

  root.querySelectorAll('[data-tree-action]').forEach((button) => button.addEventListener('click', () => {
    wheelZoomEnabled = true;
    if (button.dataset.treeAction === 'fit') { fit(); return; }
    const rect = viewport.getBoundingClientRect();
    zoomAround(scale * (button.dataset.treeAction === 'zoom-in' ? 1.25 : 1 / 1.25), rect.left + rect.width / 2, rect.top + rect.height / 2);
  }));
  viewport.addEventListener('wheel', (event) => {
    if (!wheelZoomEnabled) return;
    event.preventDefault();
    zoomAround(scale * (event.deltaY < 0 ? 1.12 : 1 / 1.12), event.clientX, event.clientY);
  }, { passive: false });
  viewport.addEventListener('keydown', (event) => {
    const moves = { ArrowLeft: [48, 0], ArrowRight: [-48, 0], ArrowUp: [0, 48], ArrowDown: [0, -48] };
    if (moves[event.key]) {
      event.preventDefault();
      wheelZoomEnabled = true;
      panX += moves[event.key][0];
      panY += moves[event.key][1];
      applyTransform(true);
    } else if (['+', '=', '-'].includes(event.key)) {
      event.preventDefault();
      wheelZoomEnabled = true;
      const rect = viewport.getBoundingClientRect();
      zoomAround(scale * (event.key === '-' ? 1 / 1.25 : 1.25), rect.left + rect.width / 2, rect.top + rect.height / 2);
    } else if (event.key === '0' || event.key === 'Home') { event.preventDefault(); fit(); }
  });
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !root.contains(document.activeElement)) return;
    wheelZoomEnabled = false;
    viewport.focus({ preventScroll: true });
  });

  const pointers = new Map();
  let dragOrigin = null;
  let pinchOrigin = null;
  viewport.addEventListener('pointerdown', (event) => {
    const startsOnNode = Boolean(event.target.closest('.web-tree-node'));
    if (startsOnNode && event.pointerType !== 'touch') return;
    wheelZoomEnabled = true;
    stage.classList.remove('is-settling');
    if (!startsOnNode) viewport.focus({ preventScroll: true });
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, type: event.pointerType });
    if (!startsOnNode) viewport.setPointerCapture(event.pointerId);
    if (pointers.size === 1 && event.pointerType !== 'touch') dragOrigin = { x: event.clientX, y: event.clientY, panX, panY };
    if (pointers.size === 2) {
      suppressClick = true;
      pointers.forEach((_, pointerID) => viewport.setPointerCapture(pointerID));
      const [a, b] = [...pointers.values()];
      const rect = viewport.getBoundingClientRect();
      pinchOrigin = { distance: Math.hypot(a.x - b.x, a.y - b.y), midpointX: (a.x + b.x) / 2, midpointY: (a.y + b.y) / 2, panX, panY, scale, rect };
    }
  });
  viewport.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId)) return;
    const previous = pointers.get(event.pointerId);
    pointers.set(event.pointerId, { ...previous, x: event.clientX, y: event.clientY });
    if (event.pointerType === 'touch' && Math.hypot(event.clientX - previous.startX, event.clientY - previous.startY) > 6) suppressClick = true;
    if (pointers.size === 1 && dragOrigin) {
      panX = dragOrigin.panX + event.clientX - dragOrigin.x;
      panY = dragOrigin.panY + event.clientY - dragOrigin.y;
      applyTransform();
    } else if (pointers.size === 2 && pinchOrigin) {
      const [a, b] = [...pointers.values()];
      const midpointX = (a.x + b.x) / 2;
      const midpointY = (a.y + b.y) / 2;
      scale = Math.max(.24, Math.min(1.8, pinchOrigin.scale * Math.hypot(a.x - b.x, a.y - b.y) / pinchOrigin.distance));
      const worldX = (pinchOrigin.midpointX - pinchOrigin.rect.left - pinchOrigin.panX) / pinchOrigin.scale;
      const worldY = (pinchOrigin.midpointY - pinchOrigin.rect.top - pinchOrigin.panY) / pinchOrigin.scale;
      panX = midpointX - pinchOrigin.rect.left - worldX * scale;
      panY = midpointY - pinchOrigin.rect.top - worldY * scale;
      applyTransform();
    }
  });
  const releasePointer = (event) => {
    pointers.delete(event.pointerId);
    pinchOrigin = null;
    const remaining = [...pointers.values()][0];
    dragOrigin = remaining && remaining.type !== 'touch' ? { x: remaining.x, y: remaining.y, panX, panY } : null;
    if (!remaining) setTimeout(() => { suppressClick = false; }, 0);
  };
  viewport.addEventListener('pointerup', releasePointer);
  viewport.addEventListener('pointercancel', releasePointer);
  viewport.addEventListener('dblclick', fit);
  renderNodes();
  requestAnimationFrame(() => centerFocus());
  let previousSize = { width: viewport.clientWidth, height: viewport.clientHeight };
  new ResizeObserver(() => {
    const nextSize = { width: viewport.clientWidth, height: viewport.clientHeight };
    if (Math.abs(nextSize.width - previousSize.width) < 16 && Math.abs(nextSize.height - previousSize.height) < 16) return;
    previousSize = nextSize;
    centerFocus();
  }).observe(viewport);
}

document.querySelectorAll('[data-family-tree]').forEach(setupFamilyTree);
