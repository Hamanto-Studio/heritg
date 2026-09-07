import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FamilyExplorer } from "./FamilyExplorer";
import { createTranslator } from "./i18n";
import type { ExplorerView } from "./familyExplorers";
import type { Person, FamilyRelationship } from "./types";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const people: Person[] = ['Child', 'Mother', 'Father', 'Sibling', 'Former', 'Baby', 'Undated'].map((id) => ({
  id, treeId: 'tree', displayName: id, gender: 'unspecified', createdAt: '2026-01-01', birthDatePrecision: 'year',
  notes: '', addressLine: '', city: id === 'Child' ? 'Bandung' : '', province: '', country: id === 'Child' ? 'Indonesia' : '', postalCode: '',
  birthDate: id === 'Child' ? '1980' : id === 'Baby' ? '2005' : undefined
}));
const relationships: FamilyRelationship[] = [['Mother', 'Child'], ['Father', 'Child'], ['Mother', 'Sibling'], ['Child', 'Baby'], ['Former', 'Baby']].map(([from, to]) => ({
  id: `${from}-${to}`, treeId: 'tree', fromPersonId: from, toPersonId: to, kind: 'parent', subtype: 'biologicalParent', createdAt: '2026-01-01'
}));
relationships.push({ id: 'partner', treeId: 'tree', fromPersonId: 'Child', toPersonId: 'Former', kind: 'partner', subtype: 'formerSpouse', marriageDate: '2000-01-01', divorceDate: '2010-01-01', createdAt: '2026-01-01' });
let root: Root, container: HTMLDivElement;
const onSelect = vi.fn(), onAdd = vi.fn(), onEdit = vi.fn(), onBackToTree = vi.fn();
const render = async (mode: ExplorerView, selectedPersonId?: string) => act(async () => root.render(<FamilyExplorer
  mode={mode} people={people} relationships={relationships} initialPersonId="Child" selectedPersonId={selectedPersonId}
  actionsVisible onSelect={onSelect} onAdd={onAdd} onEdit={onEdit} onBackToTree={onBackToTree} onInteract={() => {}}
  language="en" t={createTranslator('en')} />));
const mount = async (mode: ExplorerView) => { container = document.createElement('div'); document.body.append(container); root = createRoot(container); await render(mode); };
const button = (name: string) => [...container.querySelectorAll<HTMLElement>('button, [role="button"]')].find((el) => el.getAttribute('aria-label') === name || el.textContent === name)!;
const click = async (name: string) => act(async () => { expect(button(name), name).toBeDefined(); button(name).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
function InteractiveExplorer({ mode, language = "en", family = relationships }: {
  mode: ExplorerView; language?: "en" | "id"; family?: FamilyRelationship[];
}) {
  const [selected, setSelected] = useState<string>();
  return <FamilyExplorer mode={mode} people={people} relationships={family} initialPersonId="Child"
    selectedPersonId={selected} onSelect={(id) => { onSelect(id); setSelected((current) => current === id ? undefined : id); }}
    actionsVisible onAdd={onAdd} onEdit={onEdit} onBackToTree={onBackToTree} onInteract={() => {}}
    language={language} t={createTranslator(language)} />;
}
const mountInteractive = async (mode: ExplorerView, language: "en" | "id" = "en", family = relationships) => {
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<InteractiveExplorer mode={mode} language={language} family={family} />));
};
afterEach(async () => { if (root) await act(async () => root.unmount()); container?.remove(); vi.clearAllMocks(); });

describe('Fan exploration', () => {
  it('follows external person selection without resetting depth or duplicating Back history', async () => {
    await mount('fan');
    const current = () => container.querySelector('.fan-segment[aria-current="true"]')?.getAttribute('data-chart-person');
    const generations = container.querySelector<HTMLSelectElement>('.explorer-root-controls select')!;
    await act(async () => { generations.value = '5'; generations.dispatchEvent(new Event('change', { bubbles: true })); });
    await render('fan', 'Mother');
    expect(current()).toBe('Mother');
    expect(generations.value).toBe('5');
    expect(onSelect).not.toHaveBeenCalled();
    await render('fan', 'Father');
    expect(current()).toBe('Father');
    await render('fan');
    expect(current()).toBe('Father');
    await click('Back');
    expect(current()).toBe('Mother');
    // The parent acknowledging a Fan navigation must not add a second step.
    await render('fan', 'Mother');
    await click('Back');
    expect(current()).toBe('Child');
    expect((button('Back') as HTMLButtonElement).disabled).toBe(true);
    expect(generations.value).toBe('5');
  });

  it('transfers focus for keyboard navigation but not mouse or touch selection', async () => {
    await mountInteractive('fan');
    const current = () => container.querySelector<SVGElement>('.fan-segment[aria-current="true"]')!;
    const focus = vi.spyOn(SVGElement.prototype, 'focus');
    try {
      await act(async () => button('Mother · Generation 1 · Parent of Child')
        .dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })));
      expect(current().getAttribute('data-chart-person')).toBe('Mother');
      expect(focus).not.toHaveBeenCalled();
      await act(async () => button('Child · Child of Mother')
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
      expect(current().getAttribute('data-chart-person')).toBe('Child');
      expect(focus).toHaveBeenCalledWith({ preventScroll: true });
      expect(document.activeElement).toBe(current());
      focus.mockClear();
      await act(async () => button('Back').dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })));
      expect(current().getAttribute('data-chart-person')).toBe('Mother');
      expect(focus).not.toHaveBeenCalled();
    } finally {
      focus.mockRestore();
    }
  });

  it('recenters fan ancestors directly by keyboard and returns with Back', async () => {
    await mount('fan');
    const before = JSON.stringify({ people, relationships });
    expect(container.querySelectorAll('.explorer-person-actions')).toHaveLength(0);
    await act(async () => button('Mother · Generation 1 · Parent of Child').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(onSelect).toHaveBeenCalledWith('Mother');
    expect(container.querySelector<SVGElement>('.explorer-fan')?.style.maxHeight).toContain('100dvh');
    await render('fan', 'Mother');
    expect(container.querySelector('.fan-segment[aria-current="true"]')?.getAttribute('data-chart-person')).toBe('Mother');
    await click('Add a relative to Mother'); expect(onAdd).toHaveBeenCalledWith('Mother');
    await click('Edit Mother'); expect(onEdit).toHaveBeenCalledWith('Mother');
    expect(container.querySelector('.fan-segment[aria-current="true"]')?.getAttribute('data-chart-person')).toBe('Mother');
    await click('Back');
    expect(container.querySelector('.fan-segment[aria-current="true"]')?.getAttribute('data-chart-person')).toBe('Child');
    expect(JSON.stringify({ people, relationships })).toBe(before);
    await click('Back to tree'); expect(onBackToTree).toHaveBeenCalledOnce();
  });
  it.each(['fan'] as const)('shows children inside %s and navigates child/parent in one tap with depth and Back preserved', async (mode) => {
    await mountInteractive(mode);
    const before = JSON.stringify({ people, relationships });
    const generations = container.querySelector<HTMLSelectElement>('.explorer-root-controls select')!;
    await act(async () => { generations.value = '5'; generations.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(container.querySelector('.relative-navigation')).toBeNull();
    const children = container.querySelectorAll('.fan-child-segment[data-chart-person]');
    expect([...children].map((el) => el.getAttribute('data-chart-person'))).toEqual(['Baby']);
    {
      expect(children[0].tagName.toLowerCase()).toBe('g');
      expect(children[0].querySelector('path.fan-shape')?.getAttribute('d')).toContain(' A');
      expect(container.querySelector('.fan-child-list, .fan-descendant-stem')).toBeNull();
    }
    await click('Baby · Child of Child');
    expect(container.querySelector('.fan-segment[aria-current="true"]')?.getAttribute('data-chart-person')).toBe('Baby');
    expect(container.textContent).toContain('No children recorded');
    const parent = button('Child · Generation 1 · Parent of Baby');
    await act(async () => parent.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(container.querySelector('.fan-segment[aria-current="true"]')?.getAttribute('data-chart-person')).toBe('Child');
    expect(generations.value).toBe('5');
    await click('Back');
    expect(container.querySelector('.fan-segment[aria-current="true"]')?.getAttribute('data-chart-person')).toBe('Baby');
    await click('Back');
    expect(container.querySelector('.fan-segment[aria-current="true"]')?.getAttribute('data-chart-person')).toBe('Child');
    expect((button('Back') as HTMLButtonElement).disabled).toBe(true);
    expect(JSON.stringify({ people, relationships })).toBe(before);
  });
  it('bounds fan labels to their own shapes and retains complete accessible names', async () => {
    await mount('fan');
    const longName = 'WWW非常長い名前' + 'LongUnbrokenFamilyName'.repeat(12);
    const longPeople = people.map((person) => ({ ...person, displayName: longName + person.id }));
    await act(async () => root.render(<FamilyExplorer mode="fan" people={longPeople} relationships={relationships} initialPersonId="Child"
      actionsVisible onSelect={onSelect} onAdd={onAdd} onEdit={onEdit} onBackToTree={onBackToTree} onInteract={() => {}}
      language="en" t={createTranslator('en')} />));
    for (const text of container.querySelectorAll('.fan-segment text')) {
      const clip = text.parentElement!.getAttribute('clip-path')!;
      expect(clip).toMatch(/^url\(#.+\)$/);
      expect(document.getElementById(clip.slice(5, -1))).not.toBeNull();
      expect(text.querySelectorAll('tspan').length).toBeLessThanOrEqual(3);
      const segment = text.closest('.fan-segment')!;
      const person = longPeople.find((person) => person.id === segment.getAttribute('data-chart-person'));
      if (person) expect([...text.querySelectorAll('tspan')].map((line) => line.textContent).join(' ')).toBe(person.displayName);
    }
    expect(container.querySelector('.fan-segment[aria-current="true"]')?.getAttribute('aria-label')).toContain(longName);
    expect(container.querySelector('.fan-child-segment title')?.textContent).toContain(longName + 'Baby');
    expect(container.querySelector('.fan-child-segment')?.getAttribute('aria-label')).toContain(longName + 'Baby');
  });
  it('pages through every child in the lower fan, supports the keyboard, and keeps the page on Back', async () => {
    await mount('fan');
    const kids = Array.from({ length: 20 }, (_, i) => ({ ...people[0], id: `Kid-${i}`, displayName: `Kid ${String(i).padStart(2, '0')}` }));
    const family = kids.map((kid) => ({ ...relationships[0], id: `edge-${kid.id}`, fromPersonId: 'Child', toPersonId: kid.id }));
    const allPeople = [...people, ...kids];
    const before = JSON.stringify({ allPeople, family });
    await act(async () => root.render(<FamilyExplorer mode="fan" people={allPeople} relationships={family} initialPersonId="Child"
      actionsVisible onSelect={onSelect} onAdd={onAdd} onEdit={onEdit} onBackToTree={onBackToTree} onInteract={() => {}}
      language="en" t={createTranslator('en')} />));
    expect((button('Previous children') as HTMLButtonElement).disabled).toBe(true);
    const visible = () => [...container.querySelectorAll('.fan-child-segment')].map((el) => el.getAttribute('data-chart-person'));
    const seen = [...visible()];
    for (let page = 1; page < 5; page++) {
      await click('Next children');
      expect(container.querySelector('.fan-children-navigation [role="status"]')?.textContent).toBe(`Children · ${page * 4 + 1}–${page * 4 + 4} of 20`);
      seen.push(...visible());
    }
    expect(seen).toEqual(kids.map((kid) => kid.id));
    expect((button('Next children') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => button('Kid 19 · Child of Child').dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })));
    expect(container.querySelector('.fan-segment[aria-current="true"]')?.getAttribute('data-chart-person')).toBe('Kid-19');
    expect(container.querySelector('.fan-child-segment')).toBeNull();
    expect(container.querySelector('.fan-children-navigation')?.textContent).toBe('No children recorded');
    await click('Back');
    expect(visible()).toEqual(kids.slice(16).map((kid) => kid.id));
    await click('Previous children');
    expect(visible()).toEqual(kids.slice(12, 16).map((kid) => kid.id));
    expect(JSON.stringify({ allPeople, family })).toBe(before);
  });
  it('has no expandable person search or removed view navigation', async () => {
    await mount('fan');
    expect(container.querySelector('details, .focus-person-picker, .relative-navigation')).toBeNull();
    expect(container.textContent).not.toContain('Find another person');
    expect(container.querySelector('.fan-segment[aria-current="true"]')?.getAttribute('data-chart-person')).toBe('Child');
  });
});
