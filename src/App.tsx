import FlowRunner from "./FlowRunner";

export default function App() {
  return (
    <FlowRunner
      showInspector
      specs={[
        { name: "Init", to: ["InProgress"] },
        { name: "InProgress", to: ["With Client", "Complete", "Failed"] },
        { name: "With Client", to: ["InProgress"] },
        { name: "Complete", to: [], terminal: true },
        { name: "Failed", to: [], terminal: true },
      ]}
    />
  );
}
