const menuToggle = document.querySelector('.menu-toggle');
const siteNav = document.querySelector('#site-nav');

menuToggle?.addEventListener('click', () => {
  const isOpen = siteNav.classList.toggle('is-open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));
});

siteNav?.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    siteNav.classList.remove('is-open');
    menuToggle?.setAttribute('aria-expanded', 'false');
  });
});

document.querySelector('#year').textContent = new Date().getFullYear();

fetch('https://api.github.com/repos/Hamanto-Studio/heritg')
  .then((response) => response.ok ? response.json() : Promise.reject())
  .then((repository) => {
    document.querySelectorAll('[data-github-stars]').forEach((element) => {
      element.textContent = repository.stargazers_count.toLocaleString();
    });
  })
  .catch(() => {});

document.querySelectorAll('details').forEach((item) => {
  item.addEventListener('toggle', () => {
    if (!item.open) return;
    document.querySelectorAll('details[open]').forEach((other) => {
      if (other !== item) other.removeAttribute('open');
    });
  });
});

const familyPeople = [
  { id: 'madirono', name: 'Kyai Haji Madirono', gender: 'male', initials: 'HM', order: 0 },
  { id: 'aminah', name: 'Nyai Haji Siti Aminah', gender: 'female', initials: 'SA', order: 1 },
  { id: 'ngasirah', name: 'Mas Ayu Ngasirah', gender: 'female', initials: 'MN', order: 0 },
  { id: 'sosroningrat', name: 'R.M.A.A. Sosroningrat', gender: 'male', image: 'sosroningrat.jpg', order: 1 },
  { id: 'moerjam', name: 'R.A. Moerjam', gender: 'female', initials: 'RM', order: 2 },
  { id: 'kartini', name: 'R.A. Kartini', gender: 'female', image: 'kartini.jpg', life: '1879–1904', order: 0 },
  { id: 'djojoadiningrat', name: 'R.A.A. Djojoadiningrat', gender: 'male', initials: 'DJ', order: 1 },
  { id: 'kardinah', name: 'R.A. Kardinah', gender: 'female', image: 'kardinah.jpg', life: '1881–1971', order: 2 },
  { id: 'roekmini', name: 'R.A. Roekmini', gender: 'female', image: 'roekmini.jpg', order: 3 },
  { id: 'soesalit', name: 'R.M. Soesalit Djojoadhiningrat', gender: 'male', image: 'soesalit.jpg', life: '1904–1962', order: 0 },
  { id: 'boedhy', name: 'Boedhy Setia Soesalit', gender: 'male', initials: 'BS', order: 0 },
  { id: 'sri', name: 'Sri Biatini', gender: 'female', initials: 'SB', order: 1 },
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
  { kind: 'partner', from: 'madirono', to: 'aminah' },
  { kind: 'partner', from: 'ngasirah', to: 'sosroningrat' },
  { kind: 'partner', from: 'sosroningrat', to: 'moerjam' },
  { kind: 'partner', from: 'kartini', to: 'djojoadiningrat' },
  { kind: 'partner', from: 'boedhy', to: 'sri' },
];

const treeCopy = {
  en: {
    you: 'You', father: 'Father', mother: 'Mother', son: 'Son', daughter: 'Daughter',
    husband: 'Husband', wife: 'Wife', brother: 'Brother', sister: 'Sister',
    halfBrother: 'Half-brother', halfSister: 'Half-sister', grandfather: 'Grandfather',
    grandmother: 'Grandmother', grandson: 'Grandson', granddaughter: 'Granddaughter',
    stepfather: 'Stepfather', stepmother: 'Stepmother', stepson: 'Stepson', stepdaughter: 'Stepdaughter', ancestor: 'Ancestor',
    descendant: 'Descendant', family: 'Family member', married: 'Married', focused: 'Focused on',
  },
  id: {
    you: 'Anda', father: 'Ayah', mother: 'Ibu', son: 'Putra', daughter: 'Putri',
    husband: 'Suami', wife: 'Istri', brother: 'Saudara laki-laki', sister: 'Saudara perempuan',
    halfBrother: 'Saudara laki-laki seayah atau seibu', halfSister: 'Saudara perempuan seayah atau seibu',
    grandfather: 'Kakek', grandmother: 'Nenek', grandson: 'Cucu laki-laki',
    granddaughter: 'Cucu perempuan', stepfather: 'Ayah tiri', stepmother: 'Ibu tiri',
    stepson: 'Anak tiri laki-laki', stepdaughter: 'Anak tiri perempuan',
    ancestor: 'Leluhur', descendant: 'Keturunan', family: 'Anggota keluarga',
    married: 'Menikah', focused: 'Berfokus pada',
  },
};

function generationDepths(people, relationships) {
  const ids = new Set(people.map((person) => person.id));
  const constraints = new Map();
  const addConstraint = (first, second, offset) => {
    if (!ids.has(first) || !ids.has(second) || first === second) return;
    constraints.set(first, [...(constraints.get(first) || []), { id: second, offset }]);
    constraints.set(second, [...(constraints.get(second) || []), { id: first, offset: -offset }]);
  };

  [...relationships].sort((a, b) => (a.kind === 'parent' ? 0 : 1) - (b.kind === 'parent' ? 0 : 1))
    .forEach((relationship) => addConstraint(
      relationship.from,
      relationship.to,
      relationship.kind === 'parent' ? 1 : 0,
    ));

  const parentsByChild = new Map();
  relationships.filter((item) => item.kind === 'parent').forEach((item) => {
    parentsByChild.set(item.to, [...(parentsByChild.get(item.to) || []), item.from]);
  });
  parentsByChild.forEach((parents) => parents.slice(1).forEach((parent) => addConstraint(parents[0], parent, 0)));

  const parented = new Set(relationships.filter((item) => item.kind === 'parent').map((item) => item.to));
  const starts = [...people.filter((person) => !parented.has(person.id)), ...people]
    .filter((person, index, all) => all.findIndex((candidate) => candidate.id === person.id) === index);
  const depths = new Map();
  starts.forEach((start) => {
    if (depths.has(start.id)) return;
    depths.set(start.id, 0);
    const queue = [start.id];
    for (let index = 0; index < queue.length; index += 1) {
      const id = queue[index];
      (constraints.get(id) || []).forEach((constraint) => {
        if (depths.has(constraint.id)) return;
        depths.set(constraint.id, depths.get(id) + constraint.offset);
        queue.push(constraint.id);
      });
    }
  });
  return depths;
}

function relationshipLabel(focusID, personID, locale) {
  const copy = treeCopy[locale];
  const person = familyPeople.find((item) => item.id === personID);
  if (focusID === personID) return copy.you;
  const parentsOf = (id) => familyRelationships.filter((item) => item.kind === 'parent' && item.to === id).map((item) => item.from);
  const childrenOf = (id) => familyRelationships.filter((item) => item.kind === 'parent' && item.from === id).map((item) => item.to);
  const partnersOf = (id) => familyRelationships.filter((item) => item.kind === 'partner' && [item.from, item.to].includes(id)).map((item) => item.from === id ? item.to : item.from);
  const gendered = (male, female) => person.gender === 'female' ? female : male;

  if (parentsOf(focusID).includes(personID)) return gendered(copy.father, copy.mother);
  if (childrenOf(focusID).includes(personID)) return gendered(copy.son, copy.daughter);
  if (partnersOf(focusID).includes(personID)) return gendered(copy.husband, copy.wife);

  const focusParents = parentsOf(focusID);
  const personParents = parentsOf(personID);
  const sharedParents = focusParents.filter((id) => personParents.includes(id));
  if (sharedParents.length > 0) {
    return sharedParents.length === focusParents.length && sharedParents.length === personParents.length
      ? gendered(copy.brother, copy.sister)
      : gendered(copy.halfBrother, copy.halfSister);
  }

  if (focusParents.some((parent) => parentsOf(parent).includes(personID))) {
    return gendered(copy.grandfather, copy.grandmother);
  }
  if (childrenOf(focusID).some((child) => childrenOf(child).includes(personID))) {
    return gendered(copy.grandson, copy.granddaughter);
  }
  if (focusParents.some((parent) => partnersOf(parent).includes(personID)) && !focusParents.includes(personID)) {
    return gendered(copy.stepfather, copy.stepmother);
  }
  if (partnersOf(focusID).some((partner) => childrenOf(partner).includes(personID)) && !childrenOf(focusID).includes(personID)) {
    return gendered(copy.stepson, copy.stepdaughter);
  }

  const directedDistance = (start, target, next) => {
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
  };
  if ((directedDistance(focusID, personID, parentsOf) || 0) > 2) return copy.ancestor;
  if ((directedDistance(focusID, personID, childrenOf) || 0) > 2) return copy.descendant;
  return copy.family;
}

function setupFamilyTree(root) {
  const locale = root.dataset.treeLocale === 'en' ? 'en' : 'id';
  const assetPrefix = root.dataset.treeAssets || 'assets';
  const viewport = root.querySelector('[data-tree-viewport]');
  const stage = root.querySelector('[data-tree-stage]');
  const svg = root.querySelector('[data-tree-connectors]');
  const nodeLayer = root.querySelector('[data-tree-nodes]');
  const status = root.querySelector('[data-tree-status]');
  const depths = generationDepths(familyPeople, familyRelationships);
  const depthValues = [...depths.values()];
  const minDepth = Math.min(...depthValues);
  const maxDepth = Math.max(...depthValues);
  const rows = new Map();
  familyPeople.forEach((person) => rows.set(depths.get(person.id), [...(rows.get(depths.get(person.id)) || []), person]));
  rows.forEach((people) => people.sort((a, b) => a.order - b.order));

  const largestRow = Math.max(...[...rows.values()].map((people) => people.length));
  const stageWidth = Math.max(1300, (largestRow - 1) * 260 + 520);
  const stageHeight = (maxDepth - minDepth) * 260 + 380;
  const positions = new Map();
  rows.forEach((people, depth) => {
    const startX = stageWidth / 2 - ((people.length - 1) * 260) / 2;
    people.forEach((person, index) => positions.set(person.id, {
      x: startX + index * 260,
      y: 150 + (depth - minDepth) * 260,
    }));
  });
  stage.style.width = `${stageWidth}px`;
  stage.style.height = `${stageHeight}px`;
  svg.setAttribute('width', stageWidth);
  svg.setAttribute('height', stageHeight);

  const svgNS = 'http://www.w3.org/2000/svg';
  const drawLine = (x1, y1, x2, y2, className = '') => {
    const line = document.createElementNS(svgNS, 'line');
    Object.entries({ x1, y1, x2, y2 }).forEach(([key, value]) => line.setAttribute(key, value));
    if (className) line.setAttribute('class', className);
    svg.append(line);
  };

  const parentEdges = familyRelationships.filter((item) => item.kind === 'parent');
  const parentsByChild = new Map();
  parentEdges.forEach((edge) => parentsByChild.set(edge.to, [...new Set([...(parentsByChild.get(edge.to) || []), edge.from])].sort()));
  const childrenByParentSet = new Map();
  parentsByChild.forEach((parentIDs, childID) => {
    const key = parentIDs.join('|');
    childrenByParentSet.set(key, { parentIDs, childIDs: [...(childrenByParentSet.get(key)?.childIDs || []), childID] });
  });
  const families = [...childrenByParentSet.values()].map((family) => {
    const points = [...family.parentIDs, ...family.childIDs].map((id) => positions.get(id));
    const parentY = family.parentIDs.reduce((sum, id) => sum + positions.get(id).y, 0) / family.parentIDs.length;
    const childY = family.childIDs.reduce((sum, id) => sum + positions.get(id).y, 0) / family.childIDs.length;
    return { ...family, parentY, childY, minX: Math.min(...points.map((point) => point.x)), maxX: Math.max(...points.map((point) => point.x)), lane: 0, laneCount: 1, ports: new Map() };
  });
  const bands = new Map();
  families.forEach((family) => {
    const key = `${family.parentY}:${family.childY}`;
    bands.set(key, [...(bands.get(key) || []), family]);
  });
  bands.forEach((bandFamilies) => {
    const laneEnds = [];
    bandFamilies.sort((a, b) => a.minX - b.minX || a.maxX - b.maxX).forEach((family) => {
      const reusable = laneEnds.findIndex((end) => end + 20 < family.minX);
      family.lane = reusable < 0 ? laneEnds.length : reusable;
      laneEnds[family.lane] = family.maxX;
    });
    bandFamilies.forEach((family) => { family.laneCount = laneEnds.length; });
  });
  const familiesByParent = new Map();
  families.forEach((family) => family.parentIDs.forEach((id) => familiesByParent.set(id, [...(familiesByParent.get(id) || []), family])));
  familiesByParent.forEach((parentFamilies, parentID) => {
    parentFamilies.sort((a, b) => a.parentIDs.join('|').localeCompare(b.parentIDs.join('|'))).forEach((family, index) => {
      family.ports.set(parentID, positions.get(parentID).x + (index - (parentFamilies.length - 1) / 2) * 12);
    });
  });
  families.forEach((family) => {
    const parentStartY = family.parentY + 92;
    const childTopY = family.childY - 32;
    const availableHeight = Math.max(childTopY - parentStartY - 32, 0);
    const trackSpacing = family.laneCount > 1 ? Math.max(2, Math.min(12, availableHeight / ((family.laneCount - 1) * 2))) : 0;
    const parentJoinY = parentStartY + 8 + family.lane * trackSpacing;
    const childRailY = childTopY - 8 - (family.laneCount - 1 - family.lane) * trackSpacing;
    const parentXs = family.parentIDs.map((id) => family.ports.get(id) ?? positions.get(id).x);
    const childXs = family.childIDs.map((id) => positions.get(id).x);
    const trunkX = parentXs.reduce((sum, x) => sum + x, 0) / parentXs.length + (family.lane - (family.laneCount - 1) / 2) * 8;
    family.parentIDs.forEach((id, index) => drawLine(parentXs[index], positions.get(id).y + 92, parentXs[index], parentJoinY, 'family-connector'));
    drawLine(Math.min(...parentXs, trunkX), parentJoinY, Math.max(...parentXs, trunkX), parentJoinY, 'family-connector');
    drawLine(trunkX, parentJoinY, trunkX, childRailY, 'family-connector');
    drawLine(Math.min(...childXs, trunkX), childRailY, Math.max(...childXs, trunkX), childRailY, 'family-connector');
    family.childIDs.forEach((id) => drawLine(positions.get(id).x, childRailY, positions.get(id).x, positions.get(id).y - 32, 'family-connector'));
  });

  familyRelationships.filter((item) => item.kind === 'partner').forEach((edge) => {
    const first = positions.get(edge.from);
    const second = positions.get(edge.to);
    if (!first || !second || first.y !== second.y) return;
    const left = first.x < second.x ? first : second;
    const right = first.x < second.x ? second : first;
    drawLine(left.x + 32, left.y, right.x - 32, right.y, 'partner-connector');
    const label = document.createElementNS(svgNS, 'text');
    label.setAttribute('x', (left.x + right.x) / 2);
    label.setAttribute('y', left.y - 42);
    label.setAttribute('class', 'partner-label');
    label.textContent = treeCopy[locale].married;
    svg.append(label);
  });

  let focusID = 'kartini';
  let scale = 1;
  let panX = 0;
  let panY = 0;
  let suppressClick = false;
  const applyTransform = () => { stage.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`; };
  const renderNodes = () => {
    nodeLayer.replaceChildren();
    familyPeople.forEach((person) => {
      const point = positions.get(person.id);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `web-tree-node${person.id === focusID ? ' selected' : ''}`;
      button.style.left = `${point.x}px`;
      button.style.top = `${point.y}px`;
      button.setAttribute('aria-label', `${person.name}, ${relationshipLabel(focusID, person.id, locale)}`);
      const avatar = person.image
        ? Object.assign(document.createElement('img'), { className: 'node-avatar', src: `${assetPrefix}/${person.image}`, alt: '' })
        : Object.assign(document.createElement('span'), { className: 'node-avatar', textContent: person.initials });
      const name = Object.assign(document.createElement('strong'), { textContent: person.name });
      const role = Object.assign(document.createElement('small'), { textContent: relationshipLabel(focusID, person.id, locale) });
      button.append(avatar, name, role);
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        if (suppressClick) { suppressClick = false; return; }
        focusID = person.id;
        status.textContent = `${treeCopy[locale].focused} ${person.name}`;
        renderNodes();
        nodeLayer.querySelector('.selected')?.focus({ preventScroll: true });
        scale = Math.max(scale, .9);
        panX = viewport.clientWidth / 2 - point.x * scale;
        panY = viewport.clientHeight / 2 - point.y * scale;
        applyTransform();
      });
      nodeLayer.append(button);
    });
  };

  const fit = () => {
    const points = [...positions.values()];
    const minX = Math.min(...points.map((point) => point.x)) - 190;
    const maxX = Math.max(...points.map((point) => point.x)) + 190;
    const minY = Math.min(...points.map((point) => point.y)) - 100;
    const maxY = Math.max(...points.map((point) => point.y)) + 150;
    scale = Math.max(.2, Math.min(1.25, Math.min((viewport.clientWidth - 64) / (maxX - minX), (viewport.clientHeight - 100) / (maxY - minY))));
    panX = viewport.clientWidth / 2 - ((minX + maxX) / 2) * scale;
    panY = viewport.clientHeight / 2 - ((minY + maxY) / 2) * scale;
    applyTransform();
  };
  const zoomAround = (nextScale, clientX, clientY) => {
    const rect = viewport.getBoundingClientRect();
    const anchorX = clientX - rect.left;
    const anchorY = clientY - rect.top;
    const clamped = Math.max(.2, Math.min(1.8, nextScale));
    const factor = clamped / scale;
    panX = panX * factor + anchorX * (1 - factor);
    panY = panY * factor + anchorY * (1 - factor);
    scale = clamped;
    applyTransform();
  };

  root.querySelectorAll('[data-tree-action]').forEach((button) => button.addEventListener('click', () => {
    if (button.dataset.treeAction === 'fit') { fit(); return; }
    const factor = button.dataset.treeAction === 'zoom-in' ? 1.25 : 1 / 1.25;
    const rect = viewport.getBoundingClientRect();
    zoomAround(scale * factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }));
  viewport.addEventListener('wheel', (event) => {
    if (!root.contains(document.activeElement)) return;
    event.preventDefault();
    zoomAround(scale * (event.deltaY < 0 ? 1.12 : 1 / 1.12), event.clientX, event.clientY);
  }, { passive: false });
  viewport.addEventListener('keydown', (event) => {
    const moves = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] };
    if (moves[event.key]) {
      event.preventDefault();
      panX += moves[event.key][0];
      panY += moves[event.key][1];
      applyTransform();
      return;
    }
    if (['+', '=', '-'].includes(event.key)) {
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      zoomAround(scale * (event.key === '-' ? 1 / 1.25 : 1.25), rect.left + rect.width / 2, rect.top + rect.height / 2);
      return;
    }
    if (event.key === '0' || event.key === 'Home') { event.preventDefault(); fit(); }
  });
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && root.contains(document.activeElement)) document.activeElement.blur();
  });

  const pointers = new Map();
  let dragOrigin = null;
  let pinchOrigin = null;
  viewport.addEventListener('pointerdown', (event) => {
    const startsOnNode = Boolean(event.target.closest('.web-tree-node'));
    if (startsOnNode && event.pointerType !== 'touch') return;
    if (!startsOnNode) viewport.focus({ preventScroll: true });
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY });
    if (!startsOnNode) viewport.setPointerCapture(event.pointerId);
    if (pointers.size === 1) dragOrigin = { x: event.clientX, y: event.clientY, panX, panY };
    if (pointers.size === 2) {
      suppressClick = true;
      pointers.forEach((_, pointerID) => viewport.setPointerCapture(pointerID));
      const [a, b] = [...pointers.values()];
      pinchOrigin = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        midpointX: (a.x + b.x) / 2,
        midpointY: (a.y + b.y) / 2,
        panX,
        panY,
        scale,
      };
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
      const rect = viewport.getBoundingClientRect();
      const nextScale = Math.max(.2, Math.min(1.8, pinchOrigin.scale * Math.hypot(a.x - b.x, a.y - b.y) / pinchOrigin.distance));
      const worldX = (pinchOrigin.midpointX - rect.left - pinchOrigin.panX) / pinchOrigin.scale;
      const worldY = (pinchOrigin.midpointY - rect.top - pinchOrigin.panY) / pinchOrigin.scale;
      scale = nextScale;
      panX = midpointX - rect.left - worldX * scale;
      panY = midpointY - rect.top - worldY * scale;
      applyTransform();
    }
  });
  const releasePointer = (event) => {
    pointers.delete(event.pointerId);
    pinchOrigin = null;
    const remaining = [...pointers.values()][0];
    dragOrigin = remaining ? { x: remaining.x, y: remaining.y, panX, panY } : null;
    if (!remaining) setTimeout(() => { suppressClick = false; }, 0);
  };
  viewport.addEventListener('pointerup', releasePointer);
  viewport.addEventListener('pointercancel', releasePointer);
  viewport.addEventListener('dblclick', fit);
  renderNodes();
  requestAnimationFrame(() => {
    const point = positions.get(focusID);
    scale = .9;
    panX = viewport.clientWidth / 2 - point.x * scale;
    panY = viewport.clientHeight / 2 - point.y * scale;
    applyTransform();
  });
}

document.querySelectorAll('[data-family-tree]').forEach(setupFamilyTree);
