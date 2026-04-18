export interface TripPlan {
  eventName: string;
  contextAnalysis: string;
  detectedEventType?: string;
  assignments: {
    assigneeName: string;
    role: string;
    tasks: string[];
  }[];
}
