import { describe, it, expect, vi } from "vitest";
import { getServerLoadAction } from "../../app/actions/server-load";

// Mock requireAdmin to succeed
vi.mock("../../app/admin/actions", () => {
  return {
    requireAdmin: vi.fn().mockResolvedValue(undefined),
  };
});

describe("Server Load Action", () => {
  it("should return correct system metrics structure", async () => {
    const metrics = await getServerLoadAction();

    // Verify properties exist and match expected types
    expect(metrics).toHaveProperty("cpuUsage");
    expect(typeof metrics.cpuUsage).toBe("number");

    expect(metrics).toHaveProperty("memory");
    expect(metrics.memory).toHaveProperty("total");
    expect(metrics.memory).toHaveProperty("used");
    expect(metrics.memory).toHaveProperty("free");
    expect(metrics.memory).toHaveProperty("percentage");
    expect(typeof metrics.memory.percentage).toBe("number");

    expect(metrics).toHaveProperty("processMemory");
    expect(typeof metrics.processMemory).toBe("number");

    expect(metrics).toHaveProperty("uptime");
    expect(metrics.uptime).toHaveProperty("days");
    expect(metrics.uptime).toHaveProperty("hours");
    expect(metrics.uptime).toHaveProperty("minutes");

    expect(metrics).toHaveProperty("os");
    expect(metrics.os).toHaveProperty("platform");
    expect(metrics.os).toHaveProperty("release");
    expect(metrics.os).toHaveProperty("arch");
  });
});
