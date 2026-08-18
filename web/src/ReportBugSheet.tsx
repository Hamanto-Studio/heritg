import { MessageCircle, Send } from "lucide-react";

import {
  bugReportUrl,
  createBugReportMessage,
  type BugReportEnvironment
} from "./bugReport";
import type { Translator } from "./i18n";
import type { AppData } from "./types";
import { Modal } from "./ui";

export function ReportBugSheet({
  language,
  peopleCount,
  relationshipCount,
  t,
  onClose,
  environment
}: {
  language: AppData["language"];
  peopleCount: number;
  relationshipCount: number;
  t: Translator;
  onClose: () => void;
  environment?: BugReportEnvironment;
}) {
  const message = createBugReportMessage({
    appLanguage: language,
    appVersion: __APP_VERSION__,
    peopleCount,
    relationshipCount
  }, environment);

  return (
    <Modal
      closeLabel={t("close")}
      onClose={onClose}
      presentation="sheet"
      size="small"
      title={t("reportBug")}
    >
      <div className="report-bug-sheet">
        <p>{t("reportBugChoose")}</p>
        <div className="report-channel-list">
          <a
            className="report-channel whatsapp"
            data-report-channel="whatsapp"
            href={bugReportUrl("whatsapp", message)}
            rel="noopener noreferrer"
            target="_blank"
          >
            <span className="report-channel-icon"><MessageCircle aria-hidden="true" size={22} /></span>
            <span><strong>WhatsApp</strong><small>+62 851-8833-8123</small></span>
          </a>
          <a
            className="report-channel telegram"
            data-report-channel="telegram"
            href={bugReportUrl("telegram", message)}
            rel="noopener noreferrer"
            target="_blank"
          >
            <span className="report-channel-icon"><Send aria-hidden="true" size={21} /></span>
            <span><strong>Telegram</strong><small>@robihamanto</small></span>
          </a>
        </div>
        <p className="report-channel-help">{t("reportChannelHelp")}</p>
        <details className="report-diagnostics">
          <summary>{t("reportIncludedInfo")}</summary>
          <pre>{message}</pre>
        </details>
        <p className="report-privacy">{t("reportPrivacyDetail")}</p>
      </div>
    </Modal>
  );
}
