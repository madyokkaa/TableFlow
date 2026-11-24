"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, parseError } from "@/lib/api";
import { diffDocs, type EditorDoc, type EditorObject, type EditorTable, type SyncOp } from "@/lib/hallEditor";

function tableCreateBody(hallId: number, t: EditorTable) {
  return {
    hall_id: hallId,
    label: t.label,
    shape: t.shape,
    min_capacity: t.min_capacity,
    max_capacity: t.max_capacity,
    pos_x: t.pos_x,
    pos_y: t.pos_y,
    rotation: t.rotation,
    is_active: t.is_active,
  };
}

function objectBody(o: Partial<EditorObject>) {
  const body: Record<string, unknown> = { ...o };
  delete body.key;
  if ("label" in o) body.label = o.label ? o.label : null;
  return body;
}

/** Sends the editor's document changes to the API.
 *
 * Operations run strictly one after another (a PATCH on a just-added table
 * must wait for its POST to return an id). Server ids are tracked per
 * client key, outside the document, so undoing a deletion simply creates
 * the item again under a new id. Failed operations are reported to
 * `onError`, which reverts that one change in the editor. */
export function useHallSync({
  hallId,
  initialIds,
  onError,
}: {
  hallId: number;
  initialIds: [string, number][];
  onError: (op: SyncOp, message: string) => void;
}) {
  const serverIds = useRef(new Map<string, number>(initialIds));
  const queue = useRef<Promise<void>>(Promise.resolve());
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  });
  const [pending, setPending] = useState(0);

  const run = useCallback(
    async (op: SyncOp): Promise<void> => {
      const ids = serverIds.current;
      let res: Response | null = null;

      switch (op.type) {
        case "hall": {
          const body: Record<string, unknown> = { ...op.patch };
          if ("description" in op.patch) body.description = op.patch.description || null;
          res = await apiFetch(`/api/halls/${hallId}`, { method: "PATCH", body: JSON.stringify(body) });
          break;
        }
        case "table-create": {
          res = await apiFetch("/api/tables", {
            method: "POST",
            body: JSON.stringify(tableCreateBody(hallId, op.item)),
          });
          if (res.ok) {
            const created: { id: number } = await res.json();
            ids.set(op.item.key, created.id);
            if (op.item.manual_status) {
              res = await apiFetch(`/api/tables/${created.id}`, {
                method: "PATCH",
                body: JSON.stringify({ manual_status: op.item.manual_status }),
              });
            }
          }
          break;
        }
        case "table-patch": {
          const id = ids.get(op.key);
          if (id === undefined) return; // its creation failed and was reverted
          res = await apiFetch(`/api/tables/${id}`, { method: "PATCH", body: JSON.stringify(op.patch) });
          break;
        }
        case "table-delete": {
          const id = ids.get(op.item.key);
          if (id === undefined) return;
          res = await apiFetch(`/api/tables/${id}`, { method: "DELETE" });
          if (res.ok) ids.delete(op.item.key);
          break;
        }
        case "object-create": {
          res = await apiFetch(`/api/halls/${hallId}/objects`, {
            method: "POST",
            body: JSON.stringify(objectBody(op.item)),
          });
          if (res.ok) {
            const created: { id: number } = await res.json();
            ids.set(op.item.key, created.id);
          }
          break;
        }
        case "object-patch": {
          const id = ids.get(op.key);
          if (id === undefined) return;
          res = await apiFetch(`/api/halls/${hallId}/objects/${id}`, {
            method: "PATCH",
            body: JSON.stringify(objectBody(op.patch)),
          });
          break;
        }
        case "object-delete": {
          const id = ids.get(op.item.key);
          if (id === undefined) return;
          res = await apiFetch(`/api/halls/${hallId}/objects/${id}`, { method: "DELETE" });
          if (res.ok) ids.delete(op.item.key);
          break;
        }
      }

      if (res && !res.ok) {
        onErrorRef.current(op, await parseError(res));
      }
    },
    [hallId]
  );

  /** Persists the change from `prev` to `next`. */
  const sync = useCallback(
    (prev: EditorDoc, next: EditorDoc) => {
      const ops = diffDocs(prev, next);
      if (ops.length === 0) return;
      setPending((n) => n + ops.length);
      for (const op of ops) {
        queue.current = queue.current
          .then(() => run(op))
          .catch(() => {
            onErrorRef.current(op, "Не удалось связаться с сервером. Проверьте подключение и попробуйте снова.");
          })
          .finally(() => setPending((n) => n - 1));
      }
    },
    [run]
  );

  const serverIdOf = useCallback((key: string) => serverIds.current.get(key), []);

  return { sync, pending, serverIdOf };
}
