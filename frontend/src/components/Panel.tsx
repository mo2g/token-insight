import { PropsWithChildren, type Ref } from "react";

type PanelProps = PropsWithChildren<{
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  bodyClassName?: string;
  panelRef?: Ref<HTMLElement>;
  bodyRef?: Ref<HTMLDivElement>;
}>;

export default function Panel({
  title,
  subtitle,
  actions,
  bodyClassName,
  panelRef,
  bodyRef,
  children,
}: PanelProps) {
  return (
    <section className="panel" ref={panelRef}>
      <div className="panel-header">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {actions}
      </div>
      <div ref={bodyRef} className={bodyClassName ? `panel-body ${bodyClassName}` : "panel-body"}>
        {children}
      </div>
    </section>
  );
}
