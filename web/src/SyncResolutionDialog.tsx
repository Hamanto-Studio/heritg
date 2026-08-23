import { Cloud, HardDrive, Layers3 } from "lucide-react";
import type { ReactNode } from "react";
import type { Translator } from "./i18n";
import type { ProContextValue, SyncArchiveSummary, SyncResolution } from "./proTypes";
import { ErrorNotice, Modal } from "./ui";

const Summary = ({ icon, summary, title, t }: { icon: ReactNode; summary?: SyncArchiveSummary; title: string; t: Translator }) => <div className="sync-copy-summary">{icon}<div><strong>{title}</strong><span>{summary ? t("syncArchiveCounts", { trees: summary.trees, people: summary.people }) : t("syncArchiveEmpty")}</span></div></div>;
export function SyncResolutionDialog({ pro, t }: { pro: ProContextValue; t: Translator }) {
  const choose = (resolution: SyncResolution) => void pro.resolveSync(resolution);
  return <Modal closeLabel={t("close")} onClose={() => void pro.setSyncEnabled(false)} size="medium" title={t("firstSyncTitle")}>
    <p className="dialog-copy">{t("firstSyncDetail")}</p><div className="sync-copy-grid">
      <Summary icon={<HardDrive aria-hidden="true" size={21} />} summary={pro.sync.local} t={t} title={t("thisDeviceCopy")} />
      <Summary icon={<Cloud aria-hidden="true" size={21} />} summary={pro.sync.cloud} t={t} title={t("cloudCopy")} />
    </div><div className="sync-resolution-actions">
      <button className="button primary" onClick={() => choose("device")} type="button">{t("useThisDevice")}</button><button className="button secondary" onClick={() => choose("cloud")} type="button">{t("useCloudCopy")}</button><button className="button secondary" onClick={() => choose("both")} type="button"><Layers3 aria-hidden="true" size={17} />{t("preserveBoth")}</button>
    </div><p className="pro-legal">{t("syncChoiceWarning")}</p><ErrorNotice message={pro.error} />
  </Modal>;
}
