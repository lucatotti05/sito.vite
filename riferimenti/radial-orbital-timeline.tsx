// RIFERIMENTO TECNICO — non compilato, non importato.
// Componente "Radial Orbital Timeline" di 21st.dev (jatin-yadav05), incollato dal prompt ufficiale.
// `npx shadcn add https://21st.dev/r/jatin-yadav05/radial-orbital-timeline` oggi risponde 403
// (il registro richiede un account), quindi il file è salvato qui a mano.
//
// Cosa è stato preso per <NodoPratiche /> (src/components/nodo/):
//  - posizione dei nodi su un'orbita: angolo = indice/totale·360 + rotazione, x = r·cos, y = r·sin
//  - rotazione automatica che si ferma quando un nodo è aperto, riparte cliccando fuori
//  - toggleItem: un solo nodo aperto alla volta, i nodi correlati (relatedIds) evidenziati
//  - scheda di dettaglio con l'elenco dei nodi collegati, cliccabili
// Cosa è stato tolto: status, energy, date, gradienti, ping/pulse, setInterval a 50 ms
// (la rotazione ora è una animazione CSS sul gruppo SVG, a costo zero per React).
"use client";
import { useState, useEffect, useRef } from "react";
import { ArrowRight, Link, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface TimelineItem {
  id: number;
  title: string;
  date: string;
  content: string;
  category: string;
  icon: React.ElementType;
  relatedIds: number[];
  status: "completed" | "in-progress" | "pending";
  energy: number;
}

interface RadialOrbitalTimelineProps {
  timelineData: TimelineItem[];
}

export default function RadialOrbitalTimeline({ timelineData }: RadialOrbitalTimelineProps) {
  const [expandedItems, setExpandedItems] = useState<Record<number, boolean>>({});
  const [viewMode] = useState<"orbital">("orbital");
  const [rotationAngle, setRotationAngle] = useState<number>(0);
  const [autoRotate, setAutoRotate] = useState<boolean>(true);
  const [pulseEffect, setPulseEffect] = useState<Record<number, boolean>>({});
  const [centerOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [activeNodeId, setActiveNodeId] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const orbitRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === containerRef.current || e.target === orbitRef.current) {
      setExpandedItems({});
      setActiveNodeId(null);
      setPulseEffect({});
      setAutoRotate(true);
    }
  };

  const toggleItem = (id: number) => {
    setExpandedItems((prev) => {
      const newState = { ...prev };
      Object.keys(newState).forEach((key) => {
        if (parseInt(key) !== id) newState[parseInt(key)] = false;
      });
      newState[id] = !prev[id];
      if (!prev[id]) {
        setActiveNodeId(id);
        setAutoRotate(false);
        const newPulseEffect: Record<number, boolean> = {};
        getRelatedItems(id).forEach((relId) => (newPulseEffect[relId] = true));
        setPulseEffect(newPulseEffect);
        centerViewOnNode(id);
      } else {
        setActiveNodeId(null);
        setAutoRotate(true);
        setPulseEffect({});
      }
      return newState;
    });
  };

  useEffect(() => {
    let rotationTimer: ReturnType<typeof setInterval> | undefined;
    if (autoRotate && viewMode === "orbital") {
      rotationTimer = setInterval(() => {
        setRotationAngle((prev) => Number(((prev + 0.3) % 360).toFixed(3)));
      }, 50);
    }
    return () => rotationTimer && clearInterval(rotationTimer);
  }, [autoRotate, viewMode]);

  const centerViewOnNode = (nodeId: number) => {
    if (viewMode !== "orbital" || !nodeRefs.current[nodeId]) return;
    const nodeIndex = timelineData.findIndex((item) => item.id === nodeId);
    const targetAngle = (nodeIndex / timelineData.length) * 360;
    setRotationAngle(270 - targetAngle);
  };

  const calculateNodePosition = (index: number, total: number) => {
    const angle = ((index / total) * 360 + rotationAngle) % 360;
    const radius = 200;
    const radian = (angle * Math.PI) / 180;
    const x = radius * Math.cos(radian) + centerOffset.x;
    const y = radius * Math.sin(radian) + centerOffset.y;
    const zIndex = Math.round(100 + 50 * Math.cos(radian));
    const opacity = Math.max(0.4, Math.min(1, 0.4 + 0.6 * ((1 + Math.sin(radian)) / 2)));
    return { x, y, angle, zIndex, opacity };
  };

  const getRelatedItems = (itemId: number): number[] =>
    timelineData.find((item) => item.id === itemId)?.relatedIds ?? [];

  const isRelatedToActive = (itemId: number): boolean =>
    !!activeNodeId && getRelatedItems(activeNodeId).includes(itemId);

  return (
    <div ref={containerRef} onClick={handleContainerClick}
      className="w-full h-screen flex flex-col items-center justify-center bg-black overflow-hidden">
      <div className="relative w-full max-w-4xl h-full flex items-center justify-center">
        <div ref={orbitRef} className="absolute w-full h-full flex items-center justify-center"
          style={{ perspective: "1000px", transform: `translate(${centerOffset.x}px, ${centerOffset.y}px)` }}>
          {/* centro con gradiente viola/blu e anelli "ping" — scartato */}
          <div className="absolute w-96 h-96 rounded-full border border-white/10"></div>
          {timelineData.map((item, index) => {
            const position = calculateNodePosition(index, timelineData.length);
            const isExpanded = expandedItems[item.id];
            const isRelated = isRelatedToActive(item.id);
            const Icon = item.icon;
            return (
              <div key={item.id} ref={(el) => { nodeRefs.current[item.id] = el; }}
                className="absolute transition-all duration-700 cursor-pointer"
                style={{
                  transform: `translate(${position.x}px, ${position.y}px)`,
                  zIndex: isExpanded ? 200 : position.zIndex,
                  opacity: isExpanded ? 1 : position.opacity,
                }}
                onClick={(e) => { e.stopPropagation(); toggleItem(item.id); }}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                  isExpanded ? "bg-white text-black" : isRelated ? "bg-white/50 text-black" : "bg-black text-white"}`}>
                  <Icon size={16} />
                </div>
                <div className="absolute top-12 whitespace-nowrap text-xs">{item.title}</div>
                {isExpanded && (
                  <Card className="absolute top-20 left-1/2 -translate-x-1/2 w-64">
                    <CardHeader className="pb-2">
                      <Badge>{item.status}</Badge>
                      <span className="text-xs font-mono">{item.date}</span>
                      <CardTitle className="text-sm mt-2">{item.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs">
                      <p>{item.content}</p>
                      <div className="mt-4"><Zap size={10} /> Energy {item.energy}% {pulseEffect[item.id] ? "·" : ""}</div>
                      {item.relatedIds.length > 0 && (
                        <div className="mt-4"><Link size={10} /> Connected Nodes
                          {item.relatedIds.map((relatedId) => (
                            <Button key={relatedId} size="sm"
                              onClick={(e) => { e.stopPropagation(); toggleItem(relatedId); }}>
                              {timelineData.find((i) => i.id === relatedId)?.title}
                              <ArrowRight size={8} />
                            </Button>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
