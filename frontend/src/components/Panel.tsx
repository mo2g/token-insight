import { PropsWithChildren } from "react";

type PanelProps = PropsWithChildren<{
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  bodyClassName?: string;
}>;

export default function Panel({
  title,
  subtitle,
  actions,
  bodyClassName,
  children,
}: PanelProps) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {actions}
      </div>
      <div className={bodyClassName ? `panel-body ${bodyClassName}` : "panel-body"}>{children}</div>
    </section>
  );
}
