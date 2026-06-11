"use server";

import os from "os";
import { requireAdmin } from "@/app/admin/actions";

let lastCpuInfo = {
  idle: 0,
  total: 0,
  timestamp: 0,
};

function getCpuUsage(): number {
  const cpus = os.cpus();
  if (!cpus || cpus.length === 0) return 0;

  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    for (const type in cpu.times) {
      total += (cpu.times as any)[type];
    }
    idle += cpu.times.idle;
  }

  const now = Date.now();
  const deltaIdle = idle - lastCpuInfo.idle;
  const deltaTotal = total - lastCpuInfo.total;

  if (lastCpuInfo.total === 0 || now - lastCpuInfo.timestamp > 10000) {
    lastCpuInfo = { idle, total, timestamp: now };
    return 0;
  }

  lastCpuInfo = { idle, total, timestamp: now };
  if (deltaTotal === 0) return 0;
  const usage = 1 - deltaIdle / deltaTotal;
  return Math.round(usage * 100);
}

export async function getServerLoadAction() {
  await requireAdmin();

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memoryPercentage = Math.round((usedMem / totalMem) * 100);

  const uptimeSeconds = os.uptime();
  const days = Math.floor(uptimeSeconds / (3600 * 24));
  const hours = Math.floor((uptimeSeconds % (3600 * 24)) / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);

  const processMemoryBytes = process.memoryUsage().rss;
  const processMemoryMB = Math.round(processMemoryBytes / (1024 * 1024));

  return {
    cpuUsage: getCpuUsage(),
    memory: {
      total: (totalMem / (1024 ** 3)).toFixed(2),
      used: (usedMem / (1024 ** 3)).toFixed(2),
      free: (freeMem / (1024 ** 3)).toFixed(2),
      percentage: memoryPercentage,
    },
    processMemory: processMemoryMB,
    uptime: {
      days,
      hours,
      minutes,
      raw: uptimeSeconds,
    },
    os: {
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
    },
  };
}
