import { useLocale } from "../lib/i18n";

type MascotDockProps = {
  visible: boolean;
  placement: "gutter" | "corner";
  gutterLeft?: number;
  filterPinned: boolean;
  onTogglePinned: () => void;
  onScrollTop: () => void;
};

export default function MascotDock({
  visible,
  placement,
  gutterLeft,
  filterPinned,
  onTogglePinned,
  onScrollTop,
}: MascotDockProps) {
  const { t } = useLocale();

  return (
    <aside
      className={visible ? `mascot-dock ${placement} visible` : `mascot-dock ${placement}`}
      aria-hidden={!visible}
      style={placement === "gutter" && typeof gutterLeft === "number"
        ? { left: `${gutterLeft}px` }
        : undefined}
    >
      <button
        type="button"
        className="mascot-avatar"
        onClick={onScrollTop}
        aria-label={t("dock.scrollTop")}
      >
        <span className="mascot-avatar-antenna" />
        <span className="mascot-avatar-head">
          <span className="mascot-avatar-eye left" />
          <span className="mascot-avatar-eye right" />
          <span className="mascot-avatar-mouth" />
        </span>
        <span className="mascot-avatar-label">{t("dock.scrollTopShort")}</span>
      </button>

      <button
        type="button"
        className={filterPinned ? "mascot-toggle active" : "mascot-toggle"}
        onClick={onTogglePinned}
        aria-pressed={filterPinned}
      >
        <span>{t("dock.filterPin")}</span>
        <strong>{filterPinned ? t("dock.filterPinned") : t("dock.filterFloating")}</strong>
      </button>
    </aside>
  );
}
