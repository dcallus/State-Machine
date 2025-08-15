import React, { useEffect } from "react";
import { createMachine, createActor } from "xstate";
import { createBrowserInspector } from "@statelyai/inspect";


/**
 * A tiny, UI-free runtime flow-machine builder (XState v5).
 *
 * The user defines a set of states and allowed transitions via props.
 * Each edge becomes its own event type so the graph is explicit in devtools/VSCode.
 *
 * Example usage (drop into your App component):
 *
 * <FlowRunner
 *   specs=[
 *     { name: "Init", to: ["InProgress" ] },
 *     { name: "InProgress", to: ["WithClient", "Complete", "Failed"] },
 *     { name: "WithClient", to: ["InProgress"] },
 *     { name: "Complete", to: [], terminal: true },
 *     { name: "Failed", to: [], terminal: true },
 *   ]}
 * />
 *
 * Then in your console:
 *   window.flow.send({ type: 'TO_InProgress' })
 *   window.flow.send({ type: 'TO_WithClient' })
 *   window.flow.send({ type: 'TO_InProgress' })
 *   window.flow.send({ type: 'TO_Complete' })
 *
 * VS Code visualization: The Stately VS Code extension will detect @xstate/inspect.
 * Run the app, then run the command: "XState: Inspect Machines".
 */

// ----------------- types -----------------
export type FlowSpec = {
	name: string;            // unique state key
	to: string[];            // allowed target state names from this state
	terminal?: boolean;      // if true, this state is final
};

export type FlowRunnerProps = {
	specs: FlowSpec[];       // ordered list; first entry is initial
	readonly name?: string;  // optional machine id
};

// ----------------- builder -----------------
function makeFlowMachine(specs: FlowSpec[], id = "runtimeFlow") {
	if (!specs.length) throw new Error("specs cannot be empty");

	// quick lookup
	const byName = new Map(specs.map((s) => [s.name, s] as const));

	// build `states` object dynamically
	const states = Object.fromEntries(
		specs.map((s) => {
			// each outgoing edge becomes its own event type: `TO_${target}`
			const on = Object.fromEntries(
				s.to.map((t) => [
					`TO_${t}`,
					{ target: t },
				])
			);

			// mark invalid targets early to keep authoring honest (console error only)
			for (const t of s.to) {
				if (!byName.has(t)) {
					console.error(`[FlowMachine] Unknown target '${t}' from state '${s.name}'.`);
				}
			}

			// final state support
			const node: any = s.terminal ? { type: "final" } : { on };
			return [s.name, node];
		})
	);

	return createMachine({
		id,
		initial: specs[0].name,
		states,
	});
}

// ----------------- runner -----------------
export default function FlowRunner({ specs, name = "runtimeFlow" }: FlowRunnerProps) {
	useEffect(() => {
		if (!specs?.length) return;

		const machine = makeFlowMachine(specs, name);

		// Hook up the inspector so you can view it in browser & the VS Code extension.
		// The VS Code "Stately AI" extension listens for any @xstate/inspect session.
		const inspector = createBrowserInspector();

		const actor = createActor(machine, {
			inspect: inspector,
		});

		actor.start();

		// Expose a convenient handle for manual stepping in the console.
		// e.g., window.flow.send({ type: 'TO_MyState' })
		// (Type-safe-ish: event type must match an allowed edge from the current state.)
		// @ts-expect-error attach for debugging only
		window.flow = actor;

		console.log("Flow machine started. Current state:", actor.getSnapshot().value);
		console.log("Send events like:", "window.flow.send({ type: 'TO_<TargetState>' })");

		return () => {
			actor.stop();
			inspector?.disconnect?.();
			// @ts-expect-error cleanup
			if (window.flow === actor) delete window.flow;
		};
	}, [specs, name]);

	return (
		<div className="FlowRunner-hint">
			Open the console. Flow machine is running with {specs?.length ?? 0} states.
		</div>
	);
}

// ----------------- (optional) quick demo -----------------
// If you want to try this file standalone, you can export a demo App.
// Otherwise, import FlowRunner into your own App and pass `specs`.
export function DemoApp() {
	return (
		<div style={{ padding: 16 }}>
			<h3>Runtime Flow (XState v5)</h3>
			<FlowRunner
				specs={[
					{ name: "Init", to: ["InProgress"] },
					{ name: "InProgress", to: ["WithClient", "Complete", "Failed"] },
					{ name: "WithClient", to: ["InProgress"] },
					{ name: "Complete", to: [], terminal: true },
					{ name: "Failed", to: [], terminal: true },
				]}
			/>
			<p>
				Open devtools and try: <code>window.flow.send({ type: 'TO_InProgress' })</code>, then
				 <code>TO_WithClient</code>, <code>TO_InProgress</code>, <code>TO_Complete</code>.
			</p>
		</div>
	);
}

// Make TypeScript happy for the global debug handle
declare global {
	interface Window { flow: ReturnType<typeof createActor> | undefined }
}
