import FlowRunner from "./FlowRunner";

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

        <FlowRunner
      showInspector
      specs={[
        { name: "Init", to: ["InProgress"] },
        { name: "InProgress", to: ["With Client", "Complete: Fixed", "Complete: Issue Raised"] },
        { name: "With Client", to: ["InProgress"] },
        { name: "Complete: Fixed", to: [], terminal: true },
        { name: "Complete: Issue Raised", to: [], terminal: true },
      ]}
    />
  );
}
