export interface TripPlan {
  eventName: string;
  contextAnalysis: string;
  assignments: {
    assigneeName: string;
    role: string;
    tasks: string[];
  }[];
}
