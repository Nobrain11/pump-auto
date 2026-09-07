import { createHash } from "node:crypto";
import { once, publishEvent, enqueue } from "@/lib/redis";

export type AppEvent =
  | { type: "telegram.command"; chatId: string; text: string }
  | { type: "telegram.callback"; chatId: string; action: string }
  | { type: "trade.intent"; userId: string; orderId: string }
  | { type: "hunter.state"; userId: string; state: string }
  | { type: "emergency.stop"; userId: string; enabled: boolean };

export function eventId(event: AppEvent): string {
  return createHash("sha256").update(JSON.stringify(event)).digest("hex").slice(0, 32);
}

export async function recordEvent(event: AppEvent): Promise<boolean> {
  const id = eventId(event);
  if (!(await once(`event:${id}`, 86400))) return false;
  await publishEvent(event.type, { id, ...event });
  return true;
}

export async function queueEvent(queue: string, event: AppEvent): Promise<boolean> {
  const id = eventId(event);
  if (!(await once(`queue:${queue}:${id}`, 86400))) return false;
  await enqueue(queue, { id, ...event });
  return true;
}
