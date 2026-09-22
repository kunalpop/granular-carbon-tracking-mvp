type StageCardProps = {
  stageId: number;
  name: string;
  actorRole: string;
  status?: "pending" | "complete";
};

export default function StageCard({
  stageId,
  name,
  actorRole,
  status = "pending",
}: StageCardProps) {
  return (
    <article className="card">
      <span className="card-id">{String(stageId).padStart(2, "0")}</span>
      <strong>{name}</strong>
      <small>
        {actorRole} · {status === "complete" ? "Event recorded" : "Awaiting event output"}
      </small>
    </article>
  );
}
