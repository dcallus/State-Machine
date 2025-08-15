import React, { useEffect, useMemo, useRef, useState, useReducer } from "react";
import { createMachine, createActor, assign, type AnyActorRef } from "xstate";
import { createBrowserInspector } from "@statelyai/inspect";

// ==================== Types ====================
export type StateName = string;
export type FlowSpec = { name: StateName; to: StateName[]; terminal?: boolean };

// Generic update mapping: event name -> updater(context.data, value, currentState) => newData
export type UpdateMap = Record<string, (data: any, value: any, currentState: string) => any>;
export type Restrictions = Record<string, StateName[]>; // event -> allowed states

export type FlowRunnerWithDataProps = {
  specs: readonly FlowSpec[];
  initialContext: any;
  // Primary prop names
  updates?: UpdateMap;
  restricted?: Restrictions;
  // Back-compat aliases (so app code using fieldEvents / restrictedEvents keeps working)
  fieldEvents?: UpdateMap;
  restrictedEvents?: Restrictions;
  name?: string;
  showInspector?: boolean;
};

// ==================== Helpers ====================
const norm = (s: string) => (s ?? "").trim();
function normalizeSpecs(specs: readonly FlowSpec[]): FlowSpec[] {
  return specs.map((s) => ({ name: norm(s.name), terminal: !!s.terminal, to: (s.to ?? []).map(norm) }));
}

// ==================== Machine builder (generic, with data) ====================
export function createFlowMachineWithData(
  inputSpecs: readonly FlowSpec[],
  initialContext: any,
  updates: UpdateMap | undefined,
  restricted: Restrictions | undefined,
  id = "runtimeFlow"
) {
  const specs = normalizeSpecs(inputSpecs);
  if (!specs.length) throw new Error("specs cannot be empty");

  // Validate state names & targets
  const names = specs.map((s) => s.name);
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup) throw new Error(`[FlowRunnerWithData] Duplicate state name: '${dup}'.`);
  const byName = new Map(specs.map((s) => [s.name, s] as const));
  const missing: string[] = [];
  for (const s of specs) for (const t of s.to) if (!byName.has(t)) missing.push(`'${s.name}' -> '${t}'`);
  if (missing.length) throw new Error(`[FlowRunnerWithData] Undefined targets: ${missing.join(", ")}`);

  // Per-state transitions (explicit events: TO_<Target>)
  const states: Record<string, any> = Object.fromEntries(
    specs.map((s) => [
      s.name,
      s.terminal ? { type: "final" } : { on: Object.fromEntries(s.to.map((t) => [`TO_${t}`, { target: t }])) },
    ])
  );

  // Global update events based on `updates` map
  const on: Record<string, any> = {};
  const updEntries = Object.entries(updates ?? {});
  for (const [eventType, updater] of updEntries) {
    const allowed = (restricted?.[eventType] ?? []).map(norm);
    if (allowed.length) {
      on[eventType] = [
        {
          guard: ({ self }: any) => allowed.includes(String(self.getSnapshot().value)),
          actions: assign({
            data: ({ context, event }: any) => updater(context.data, event?.value, String(self.getSnapshot().value)),
          }),
        },
        { actions: () => console.warn(`[FlowRunnerWithData] '${eventType}' ignored in this state`) },
      ];
    } else {
      on[eventType] = {
        actions: assign({
          data: ({ context, event }: any) => updater(context.data, event?.value, ""),
        }),
      };
    }
  }

  return createMachine({
    id,
    context: { data: initialContext },
    initial: specs[0].name,
    states,
    on,
  });
}

// ==================== Runner (iframe + side controls; stable) ====================
export default function FlowRunnerWithData({
  specs: rawSpecs,
  initialContext,
  updates,
  restricted,
  fieldEvents,
  restrictedEvents,
  name = "runtimeFlow",
  showInspector = true,
}: FlowRunnerWithDataProps) {
  const specs = useMemo(() => normalizeSpecs(rawSpecs), [rawSpecs]);
  // Merge primary and alias props (alias wins to match your current App.tsx)
  const mergedUpdates = useMemo<UpdateMap | undefined>(() => fieldEvents ?? updates, [fieldEvents, updates]);
  const mergedRestricted = useMemo<Restrictions | undefined>(() => restrictedEvents ?? restricted, [restrictedEvents, restricted]);

  const actorRef = useRef<AnyActorRef | null>(null);
  const inspectorRef = useRef<ReturnType<typeof createBrowserInspector> | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // force re-render on state changes for live panel updates
  const [, force] = useReducer((x) => x + 1, 0);

  const machine = useMemo(
    () => createFlowMachineWithData(specs, initialContext, mergedUpdates, mergedRestricted, name),
    [specs, initialContext, mergedUpdates, mergedRestricted, name]
  );

  useEffect(() => {
    if (!specs?.length) return;
    if (actorRef.current) return;

    const iframe = iframeRef.current ?? undefined;
    try {
      if (showInspector && iframe) {
        inspectorRef.current = createBrowserInspector({ iframe, url: "https://stately.ai/inspect" });
      }
    } catch (err) {
      console.warn("[FlowRunnerWithData] Inspector unavailable; continuing without.", err);
    }

    const actor = inspectorRef.current
      ? createActor(machine, { inspect: inspectorRef.current.inspect })
      : createActor(machine);

    actorRef.current = actor;

    const sub = actor.subscribe((snap) => {
      // dev log: incoming events and new state
      if ((snap as any)._event) {
        try {
          const evt = (snap as any)._event;
          console.log("[FlowRunnerWithData] EVENT ->", evt.type, evt);
        } catch {}
      }
      force();
    });

    actor.start();

    // Dev console helpers
    (window as any).flow = actor;
    (window as any).flowData = {
      get: () => actor.getSnapshot().context.data,
      send: (type: string, value?: any) => actor.send(value !== undefined ? { type, value } : { type }),
    };

    return () => {
      sub.unsubscribe?.();
      inspectorRef.current?.stop?.();
      actor.stop();
      actorRef.current = null;
      delete (window as any).flow;
      delete (window as any).flowData;
    };
  }, [specs, machine, showInspector]);

  // Simple side panel
  const snap = actorRef.current?.getSnapshot?.();
  const current = String(snap?.value ?? specs[0]?.name ?? "");
  const data = (snap?.context as any)?.data;
  const outgoing = specs.find((s) => s.name === current)?.to ?? [];

  return (
    <div className="FlowRunnerWithData-root" style={{ display: "grid", gridTemplateColumns: showInspector ? "360px 1fr" : "1fr", alignItems: "start", gap: 12 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <div><strong>State:</strong> <code>{current}</code></div>
        <div>
          <strong>Data:</strong>
          <pre style={{ background: "#f7f7f7", padding: 8, borderRadius: 6, marginTop: 4 }}>{JSON.stringify(data, null, 2)}</pre>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span>Transitions:</span>
          {outgoing.length ? (
            outgoing.map((t) => (
              <button key={t} onClick={() => actorRef.current?.send({ type: `TO_${t}` })} style={{ padding: "4px 8px", cursor: "pointer" }}>
                TO_{t}
              </button>
            ))
          ) : (
            <em>(none)</em>
          )}
        </div>
      </div>

      {showInspector && (
        <div style={{ width: 1200, height: 520, border: "1px solid #ddd", borderRadius: 8, overflow: "hidden" }}>
          <iframe
            ref={iframeRef}
            title="Stately Inspector"
            src="https://stately.ai/inspect"
            style={{ width: "100%", height: "100%", border: 0 }}
            tabIndex={0}
            allow="clipboard-read; clipboard-write;"
          />
        </div>
      )}
    </div>
  );
}
