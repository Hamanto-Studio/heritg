import {
  Bug,
  Focus,
  GitBranch,
  Hand,
  Menu,
  UserRoundPlus,
  UsersRound
} from "lucide-react";

import type { Translator } from "./i18n";
import { SidePanel } from "./ui";

export function HelpPanel({
  onClose,
  onReportBug,
  t
}: {
  onClose: () => void;
  onReportBug: () => void;
  t: Translator;
}) {
  const items = [
    [Hand, t("helpMoveTitle"), t("helpMoveDetail")],
    [UserRoundPlus, t("helpAddTitle"), t("helpAddDetail")],
    [Menu, t("helpTreesTitle"), t("helpTreesDetail")],
    [UsersRound, t("helpPeopleTitle"), t("helpPeopleDetail")],
    [GitBranch, t("helpDepthTitle"), t("helpDepthDetail")],
    [Focus, t("helpZoomTitle"), t("helpZoomDetail")]
  ] as const;

  return (
    <SidePanel closeLabel={t("close")} onClose={onClose} title={t("help")}>
      <p className="panel-intro">{t("helpIntro")}</p>
      <div className="help-list">
        {items.map(([Icon, title, detail]) => (
          <section className="help-item" key={title}>
            <span className="panel-icon"><Icon aria-hidden="true" size={19} /></span>
            <div>
              <h3>{title}</h3>
              <p>{detail}</p>
            </div>
          </section>
        ))}
      </div>
      <button className="help-report-button" onClick={onReportBug} type="button">
        <span className="panel-icon"><Bug aria-hidden="true" size={19} /></span>
        <span><strong>{t("reportBug")}</strong><small>{t("reportBugDetail")}</small></span>
      </button>
    </SidePanel>
  );
}
