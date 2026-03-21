type MetricCardProps = {
  label: string;
  value: string;
  detail?: string;
  tone?: "mint" | "amber";
};

export default function MetricCard({
  label,
  value,
  detail,
  tone = "mint",
}: MetricCardProps) {
  return (
    <article className={`metric-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <p>{detail}</p> : null}
    </article>
  );
}
