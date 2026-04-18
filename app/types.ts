export interface TripPlan {
  eventName: string;
  contextAnalysis: string;
  detectedEventType?: string;
  planningMode?: "simple" | "normal" | "complex";
  assignments: {
    assigneeName: string;
    role: string;
    tasks: string[];
  }[];
}
