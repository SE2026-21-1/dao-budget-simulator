import { describe, expect, it } from "vitest";
import { loadProposalFixtures } from "../data/proposals";
import { proposalTimeline } from "./proposalTimeline";

const proposals = (await loadProposalFixtures()).proposals;

describe("proposal timeline from BE01 snapshots", () => {
  for (const state of ["Pending", "Active", "Succeeded", "Defeated", "Queued", "Executed", "Canceled"] as const) {
    it(`${state} only completes milestones evidenced by its snapshot`, () => {
      const proposal = proposals.find((item) => item.state === state);
      expect(proposal).toBeDefined();
      const timeline = proposalTimeline(proposal!);
      const complete = timeline.filter((item) => item.phase === "complete").map((item) => item.label);
      expect(complete).toContain("Đề xuất");
      expect(complete.includes("Bỏ phiếu")).toBe(["Succeeded", "Defeated", "Queued", "Executed"].includes(state));
      expect(complete.includes("Thông qua")).toBe(["Succeeded", "Queued", "Executed"].includes(state));
      expect(complete.includes("Xếp hàng")).toBe(["Queued", "Executed"].includes(state));
      expect(complete.includes("Thực thi")).toBe(state === "Executed");
      expect(timeline.some((item) => item.label === "Không thông qua" && item.phase === "terminal")).toBe(state === "Defeated");
      expect(timeline.some((item) => item.label === "Đã hủy" && item.phase === "terminal")).toBe(state === "Canceled");
      expect(timeline.some((item) => item.phase === "complete" && item.detail.startsWith("Chưa"))).toBe(false);
    });
  }
});
