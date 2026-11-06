import type { FixtureContext } from "../data/proposals";

export default function SnapshotInfo({ context }: { context: FixtureContext }) {
  return <p className="snapshot-info" aria-label="Thông tin snapshot">
    {context.dataKind === "chain" ? "API" : "Fixture"} · Block {context.asOfBlock} · Hash <code>{context.asOfBlockHash}</code> · Revision <code>{context.snapshotRevision}</code>
    {context.dataKind === "chain" && <> · Đồng bộ lúc tải: {context.sync?.status ?? "chưa xác định"}</>}
  </p>;
}
