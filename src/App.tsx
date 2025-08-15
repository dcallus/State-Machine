import FlowRunnerWithData from "./FlowRunner";

export default function App() {
  return (
    // EXAMPLE: Basic Halo Ticket
    // <FlowRunner
    //   showInspector
    //   specs={[
    //     { name: "Init", to: ["InProgress"] },
    //     { name: "InProgress", to: ["With Client", "Complete: Fixed", "Complete: Issue Raised"] },
    //     { name: "With Client", to: ["InProgress"] },
    //     { name: "Complete: Fixed", to: [], terminal: true },
    //     { name: "Complete: Issue Raised", to: [], terminal: true },
    //   ]}
    // />

       <FlowRunnerWithData
  specs={[
    { name: "Init", to: ["Edit"] },
    { name: "Edit", to: ["Saved", "Delete"] },
    { name: "Saved", to: ["Edit", "Delete", "Approval"] },
    {name: "Approval", to: ["Approved"]},
    {name: "Approved", to: ["Merge"]},
    { name: "Merge", to: [], terminal: true },
    { name: "Delete", to: [], terminal: true },
  ]}
  initialContext={{
    reference: "01a",
    assignedTo: "Dan",
    date: "8 Nov 84",
    approvers: [],
  }}
  fieldEvents={{
    SET_REFERENCE: (ctx, val) => ({ ...ctx, reference: val }),
    SET_ASSIGNEDTO: (ctx, val) => ({ ...ctx, assignedTo: val }),
    SET_DATE: (ctx, val) => ({ ...ctx, date: val }),
    ADD_APPROVER: (ctx, val) => ({
      ...ctx,
      approvers: [...ctx.approvers, val],
    }),
  }}
  restrictedEvents={{
    ADD_APPROVER: ["With Client"],
  }}
/>

  );
}
