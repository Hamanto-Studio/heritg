import {
  LockKeyhole,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  TreePine,
  Upload,
  X
} from "lucide-react";
import { useDeferredValue, useRef, useState } from "react";

import { importGedcom, importHeritgBackup, MAX_PORTABILITY_BYTES, validateAppData } from "./portability";
import type { AppActions } from "./store";
import type { AppData, FamilyTree } from "./types";
import type { Translator } from "./i18n";
import { ConfirmDialog, ErrorNotice, Modal } from "./ui";

type EditState =
  | { kind: "create"; value: string }
  | { kind: "rename"; tree: FamilyTree; value: string };

interface TreeSidebarProps {
  data: AppData;
  actions: AppActions;
  open: boolean;
  t: Translator;
  onClose: () => void;
  onError: (message: string) => void;
  onImported: () => void;
}

const treeDate = (value: string, language: AppData["language"]) =>
  new Intl.DateTimeFormat(language === "id" ? "id-ID" : "en", {
    day: "numeric",
    month: "short"
  }).format(new Date(value));

export function TreeSidebar({
  data,
  actions,
  open,
  t,
  onClose,
  onError,
  onImported
}: TreeSidebarProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase());
  const [menuTreeId, setMenuTreeId] = useState<string>();
  const [edit, setEdit] = useState<EditState>();
  const [deleting, setDeleting] = useState<FamilyTree>();
  const [editError, setEditError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);
  const trees = [...data.trees]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .filter((tree) => tree.title.toLocaleLowerCase().includes(deferredQuery));

  const suggestedTitle = () => {
    const base = data.language === "id" ? "Silsilah Keluarga Saya" : "My Family Tree";
    if (!data.trees.some((tree) => tree.title === base)) return base;
    let number = 2;
    while (data.trees.some((tree) => tree.title === `${base} ${number}`)) number += 1;
    return `${base} ${number}`;
  };

  const saveTree = () => {
    if (!edit) return;
    try {
      if (edit.kind === "create") actions.createTree(edit.value);
      else actions.renameTree(edit.tree.id, edit.value);
      setEdit(undefined);
      setEditError(undefined);
      onClose();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : t("errorTitle"));
    }
  };

  const readImport = async (file: File) => {
    if (file.size === 0 || file.size > MAX_PORTABILITY_BYTES) {
      throw new Error("Choose a non-empty family file smaller than 32 MB.");
    }
    const source = await file.text();
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith(".json")) {
      actions.replaceData(importHeritgBackup(source, { into: data }));
    } else if (lowerName.endsWith(".ged") || lowerName.endsWith(".gedcom")) {
      const imported = importGedcom(source, {
        title: file.name.replace(/\.(?:ged|gedcom)$/i, ""),
        language: data.language
      });
      actions.replaceData(validateAppData({
        ...data,
        trees: [...data.trees, ...imported.trees],
        people: [...data.people, ...imported.people],
        relationships: [...data.relationships, ...imported.relationships],
        selectedTreeId: imported.selectedTreeId,
        viewports: { ...data.viewports, ...imported.viewports }
      }));
    } else {
      throw new Error("Choose a HERITG JSON backup, .ged, or .gedcom file.");
    }
    onImported();
    onClose();
  };

  return (
    <>
      <button
        aria-label={t("close")}
        className={`drawer-backdrop ${open ? "open" : ""}`}
        onClick={onClose}
        type="button"
      />
      <aside
        aria-hidden={!open}
        aria-label={t("familyTrees")}
        className={`tree-sidebar ${open ? "open" : ""}`}
        id="tree-navigation"
      >
        <div className="sidebar-brand">
          <img alt="" aria-hidden="true" className="brand-mark" height={192} src="/pwa-192.png" width={192} />
          <div>
            <h1>Heritg</h1>
            <p>{t("appTagline")}</p>
          </div>
          <button
            aria-label={t("close")}
            className="icon-button quiet small sidebar-close"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>

        <div className="sidebar-heading">
          <h2>{t("familyTrees")}</h2>
          <button
            aria-label={t("newTree")}
            className="icon-button quiet small"
            onClick={() => setEdit({ kind: "create", value: suggestedTitle() })}
            type="button"
          >
            <Plus aria-hidden="true" size={18} />
          </button>
        </div>
        <label className="sidebar-search">
          <Search aria-hidden="true" size={17} />
          <span className="sr-only">{t("searchTrees")}</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchTrees")}
            type="search"
            value={query}
          />
        </label>

        <div className="tree-list">
          {trees.map((tree) => {
            const count = data.people.filter((person) => person.treeId === tree.id).length;
            return (
              <div className={`tree-row ${tree.id === data.selectedTreeId ? "active" : ""}`} key={tree.id}>
                <button
                  className="tree-row-open"
                  onClick={() => {
                    actions.selectTree(tree.id);
                    setMenuTreeId(undefined);
                    onClose();
                  }}
                  type="button"
                >
                  <span className="tree-icon"><TreePine aria-hidden="true" size={19} /></span>
                  <span className="tree-copy">
                    <strong>{tree.title}</strong>
                    <span>{t("peopleCount", { count })} · {treeDate(tree.updatedAt, data.language)}</span>
                  </span>
                </button>
                <div className="tree-menu-wrap">
                  <button
                    aria-expanded={menuTreeId === tree.id}
                    aria-label={`${tree.title}: ${t("treeActions")}`}
                    className="icon-button quiet small"
                    onClick={() => setMenuTreeId(menuTreeId === tree.id ? undefined : tree.id)}
                    type="button"
                  >
                    <MoreHorizontal aria-hidden="true" size={18} />
                  </button>
                  {menuTreeId === tree.id ? (
                    <div className="tree-menu">
                      <button onClick={() => {
                        setEdit({ kind: "rename", tree, value: tree.title });
                        setMenuTreeId(undefined);
                      }} type="button">
                        <Pencil aria-hidden="true" size={15} /> {t("rename")}
                      </button>
                      <button className="danger-text" onClick={() => {
                        setDeleting(tree);
                        setMenuTreeId(undefined);
                      }} type="button">
                        <Trash2 aria-hidden="true" size={15} /> {t("delete")}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <div className="sidebar-actions">
          <button className="button primary full" onClick={() =>
            setEdit({ kind: "create", value: suggestedTitle() })
          } type="button">
            <Plus aria-hidden="true" size={17} /> {t("newTree")}
          </button>
          <button className="button secondary full" onClick={() => inputRef.current?.click()} type="button">
            <Upload aria-hidden="true" size={17} /> {t("importFile")}
          </button>
          <input
            accept=".json,.ged,.gedcom,application/json,text/plain"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void readImport(file).catch((error: unknown) =>
                onError(error instanceof Error ? error.message : t("errorTitle"))
              );
            }}
            ref={inputRef}
            type="file"
          />
        </div>
        <div className="privacy-note">
          <LockKeyhole aria-hidden="true" size={16} />
          <span><strong>{t("localOnly")}</strong><br />{t("localOnlyDetail")}</span>
        </div>
      </aside>

      {edit ? (
        <Modal
          closeLabel={t("close")}
          onClose={() => setEdit(undefined)}
          size="small"
          title={edit.kind === "create" ? t("newTree") : t("renameTree")}
          footer={
            <>
              <button className="button secondary" onClick={() => setEdit(undefined)} type="button">{t("cancel")}</button>
              <button className="button primary" onClick={saveTree} type="button">
                {edit.kind === "create" ? t("createTree") : t("save")}
              </button>
            </>
          }
        >
          <label className="field">
            {t("treeName")}
            <input
              autoFocus
              maxLength={160}
              onChange={(event) => setEdit({ ...edit, value: event.target.value })}
              onKeyDown={(event) => { if (event.key === "Enter") saveTree(); }}
              value={edit.value}
            />
          </label>
          <ErrorNotice message={editError} />
        </Modal>
      ) : null}

      {deleting ? (
        <ConfirmDialog
          confirmLabel={t("deleteTree")}
          message={t("deleteTreeWarning", {
            people: data.people.filter((person) => person.treeId === deleting.id).length,
            relationships: data.relationships.filter((item) => item.treeId === deleting.id).length
          })}
          onClose={() => setDeleting(undefined)}
          onConfirm={() => {
            actions.deleteTree(deleting.id);
            setDeleting(undefined);
          }}
          t={t}
          title={t("deleteTreeQuestion", { name: deleting.title })}
        />
      ) : null}
    </>
  );
}
