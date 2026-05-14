"use client";

import { useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

const initialNodes: Node[] = [
  {
    id: "1",
    type: "input",
    position: { x: 80, y: 120 },
    data: { label: "Text Input" },
  },
  {
    id: "2",
    position: { x: 360, y: 120 },
    data: { label: "HeyGen Avatar" },
  },
  {
    id: "3",
    type: "output",
    position: { x: 640, y: 120 },
    data: { label: "Preview" },
  },
];

const initialEdges: Edge[] = [
  { id: "e1-2", source: "1", target: "2" },
  { id: "e2-3", source: "2", target: "3" },
];

const palette = [
  "Text Input",
  "Prompt (LLM)",
  "HeyGen Avatar",
  "ElevenLabs TTS",
  "Fal Image",
  "Hyperframes Compose",
  "Preview",
];

export default function Editor() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (c: Connection) => setEdges((eds) => addEdge(c, eds)),
    [setEdges],
  );

  const addNode = (label: string) => {
    const id = String(Date.now());
    setNodes((nds) => [
      ...nds,
      {
        id,
        position: { x: 200 + Math.random() * 200, y: 200 + Math.random() * 200 },
        data: { label },
      },
    ]);
  };

  return (
    <div className="flex h-screen w-screen bg-zinc-950 text-zinc-100">
      <aside className="w-60 shrink-0 border-r border-zinc-800 p-4 space-y-3">
        <h1 className="text-lg font-semibold tracking-tight">FrameLab</h1>
        <p className="text-xs text-zinc-400">Drag-free MVP — click to add.</p>
        <div className="pt-2 space-y-1">
          {palette.map((label) => (
            <button
              key={label}
              onClick={() => addNode(label)}
              className="w-full text-left text-sm px-3 py-2 rounded-md border border-zinc-800 hover:bg-zinc-900 hover:border-zinc-700 transition"
            >
              {label}
            </button>
          ))}
        </div>
      </aside>
      <main className="flex-1 relative">
        <div className="absolute top-3 right-3 z-10 flex gap-2">
          <button
            onClick={() => alert("Run: graph executor coming next.")}
            className="px-4 py-2 text-sm rounded-md bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-medium"
          >
            Run
          </button>
        </div>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
          colorMode="dark"
        >
          <Background gap={20} />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </main>
    </div>
  );
}
