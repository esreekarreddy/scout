import type { CSSProperties } from "react";
import type { AgentState, Aspect, Finding } from "@/lib/types";

const aspectLabels: Record<Aspect, string> = {
  hallucination: "Hallucination",
  "spec-drift": "Spec drift",
  "test-theater": "Test theater",
};

const aspectColors: Record<Aspect, string> = {
  hallucination: "var(--red)",
  "spec-drift": "var(--amber)",
  "test-theater": "var(--blue)",
};

interface GraphNode {
  id: string;
  label: string;
  eyebrow: string;
  x: number;
  y: number;
  tone: string;
  detail?: string;
  muted?: boolean;
}

interface GraphEdge {
  id: string;
  from: GraphNode;
  to: GraphNode;
  tone: string;
}

function compactPath(path: string) {
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 2) return path;
  return parts.slice(-2).join("/");
}

function distributeY(index: number, total: number) {
  if (total <= 1) return 50;
  const min = 18;
  const max = 82;
  return min + (index * (max - min)) / (total - 1);
}

function fileKey(file: string) {
  return file.toLowerCase();
}

function nodeStyle(node: GraphNode): CSSProperties {
  return {
    position: "absolute",
    left: `${node.x}%`,
    top: `${node.y}%`,
    width: 96,
    minHeight: 58,
    transform: "translate(-50%, -50%)",
    border: `1px solid ${node.muted ? "var(--border)" : node.tone}`,
    borderRadius: 8,
    background: node.muted ? "var(--surface)" : "rgba(255,255,255,0.94)",
    padding: "8px 9px",
    boxShadow: node.muted ? "none" : "0 8px 20px rgba(21, 24, 19, 0.07)",
    opacity: node.muted ? 0.72 : 1,
  };
}

function buildNodes(repo: string, findings: Finding[], agents: AgentState[]) {
  const visibleFindings = findings.slice(0, 4);
  const visibleFiles = [...new Map(visibleFindings.map((finding) => [fileKey(finding.file), finding.file])).values()].slice(0, 4);

  const repoNode: GraphNode = {
    id: "repo",
    label: repo || "Repository",
    eyebrow: "source",
    x: 10,
    y: 50,
    tone: "var(--border-strong)",
    detail: "tool intake",
  };

  const agentNodes = agents.map<GraphNode>((agent, index) => ({
    id: `agent-${agent.aspect}`,
    label: aspectLabels[agent.aspect],
    eyebrow: agent.status,
    x: 28,
    y: distributeY(index, Math.max(agents.length, 1)),
    tone: aspectColors[agent.aspect],
    detail: `${agent.findings.length} finding${agent.findings.length === 1 ? "" : "s"}`,
    muted: agent.status === "idle",
  }));

  const findingNodes = (visibleFindings.length > 0 ? visibleFindings : [null]).map<GraphNode>((finding, index, rows) => ({
    id: finding ? `finding-${finding.id}` : "finding-empty",
    label: finding ? finding.title : "Awaiting proof",
    eyebrow: finding?.verdict ?? "judge",
    x: 50,
    y: distributeY(index, rows.length),
    tone: finding ? aspectColors[finding.aspect] : "var(--border-strong)",
    detail: finding ? `${finding.severity} ${finding.confidence}%` : "scouts streaming",
    muted: !finding,
  }));

  const fileNodes = (visibleFiles.length > 0 ? visibleFiles : ["No file yet"]).map<GraphNode>((file, index, rows) => ({
    id: `file-${fileKey(file)}`,
    label: compactPath(file),
    eyebrow: "file",
    x: 73,
    y: distributeY(index, rows.length),
    tone: "var(--green)",
    detail: visibleFiles.length > 0 ? "evidence cited" : "pending",
    muted: visibleFiles.length === 0,
  }));

  const receiptNode: GraphNode = {
    id: "receipt",
    label: "Trace receipt",
    eyebrow: "handoff",
    x: 90,
    y: 50,
    tone: "var(--blue)",
    detail: findings.length > 0 ? "ready to explain" : "pending",
    muted: findings.length === 0,
  };

  const fileNodeByKey = new Map(fileNodes.map((node) => [node.id.replace("file-", ""), node]));
  const findingNodeById = new Map(findingNodes.map((node) => [node.id.replace("finding-", ""), node]));
  const agentNodeByAspect = new Map(agentNodes.map((node) => [node.id.replace("agent-", "") as Aspect, node]));

  const repoEdges: GraphEdge[] = agentNodes.map((node) => ({
    id: `repo-${node.id}`,
    from: repoNode,
    to: node,
    tone: "var(--border-strong)",
  }));

  const findingEdges = visibleFindings.flatMap((finding) => {
    const node = findingNodeById.get(finding.id);
    if (!node) return [];
    const matchedAspects = finding.matchedAgents?.length ? finding.matchedAgents : [finding.aspect];
    return matchedAspects
      .map((aspect) => agentNodeByAspect.get(aspect))
      .filter((agentNode): agentNode is GraphNode => Boolean(agentNode))
      .map((agentNode) => ({
        id: `${agentNode.id}-${node.id}`,
        from: agentNode,
        to: node,
        tone: agentNode.tone,
      }));
  });

  const fileEdges = visibleFindings
    .map((finding) => {
      const from = findingNodeById.get(finding.id);
      const to = fileNodeByKey.get(fileKey(finding.file));
      if (!from || !to) return null;
      return {
        id: `${from.id}-${to.id}`,
        from,
        to,
        tone: "var(--green)",
      };
    })
    .filter((edge): edge is GraphEdge => Boolean(edge));

  const receiptEdges = fileNodes.map((node) => ({
    id: `${node.id}-receipt`,
    from: node,
    to: receiptNode,
    tone: "var(--blue)",
  }));

  return {
    nodes: [repoNode, ...agentNodes, ...findingNodes, ...fileNodes, receiptNode],
    edges: [...repoEdges, ...findingEdges, ...fileEdges, ...receiptEdges],
    visibleFindings,
    visibleFiles,
  };
}

export function EvidenceMap({
  repo,
  findings,
  agents,
}: {
  repo: string;
  findings: Finding[];
  agents: AgentState[];
}) {
  const { nodes, edges, visibleFindings, visibleFiles } = buildNodes(repo, findings, agents);
  const confirmed = findings.filter((finding) => finding.verdict === "confirmed").length;
  const agentAgreement = findings.filter((finding) => (finding.matchedAgents?.length ?? 0) > 1).length;

  return (
    <section className="card anim-fade-in" aria-labelledby="evidence-map-title" style={{ overflow: "hidden" }}>
      <div
        style={{
          padding: "16px 18px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div style={{ flex: "1 1 240px" }}>
          <p id="evidence-map-title" style={{ fontWeight: 900, fontSize: 15 }}>
            Evidence graph
          </p>
          <p style={{ color: "var(--ink-2)", fontSize: 12, marginTop: 3, maxWidth: 620 }}>
            Scout keeps repo intake, specialist claims, cited files, and receipt handoff connected as proof units.
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(58px, 1fr))", gap: 8, flex: "1 1 230px", maxWidth: 280 }}>
          {[
            ["Findings", findings.length],
            ["Confirmed", confirmed],
            ["Agree", agentAgreement],
          ].map(([label, value]) => (
            <div key={label} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "7px 8px", background: "var(--canvas)" }}>
              <p style={{ color: "var(--ink-3)", fontSize: 10, fontWeight: 800, textTransform: "uppercase" }}>{label}</p>
              <p style={{ marginTop: 2, fontWeight: 900, fontSize: 16 }}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="scroll-thin" style={{ overflowX: "auto", background: "var(--surface)" }}>
        <div style={{ position: "relative", minWidth: 620, height: 318, padding: 16 }}>
          <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
            {edges.map((edge) => (
              <path
                key={edge.id}
                d={`M ${edge.from.x} ${edge.from.y} C ${(edge.from.x + edge.to.x) / 2} ${edge.from.y}, ${(edge.from.x + edge.to.x) / 2} ${edge.to.y}, ${edge.to.x} ${edge.to.y}`}
                fill="none"
                stroke={edge.tone}
                strokeOpacity={edge.from.muted || edge.to.muted ? 0.16 : 0.38}
                strokeWidth={0.42}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>

          {nodes.map((node) => (
            <div key={node.id} style={nodeStyle(node)}>
              <p style={{ color: node.tone, fontSize: 9, fontWeight: 900, textTransform: "uppercase" }}>{node.eyebrow}</p>
              <p style={{ marginTop: 4, fontSize: 12, fontWeight: 800, lineHeight: 1.2, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                {node.label}
              </p>
              <p style={{ color: "var(--ink-3)", fontSize: 10, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {node.detail}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          borderTop: "1px solid var(--border)",
          padding: "12px 18px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: 10,
          background: "var(--canvas)",
        }}
      >
        <p style={{ color: "var(--ink-2)", fontSize: 12 }}>
          <strong style={{ color: "var(--ink)" }}>{visibleFindings.length || 0}</strong> visible finding nodes from the judge queue.
        </p>
        <p style={{ color: "var(--ink-2)", fontSize: 12 }}>
          <strong style={{ color: "var(--ink)" }}>{visibleFiles.length || 0}</strong> cited file nodes kept in context for repair.
        </p>
      </div>
    </section>
  );
}
