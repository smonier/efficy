export interface NewOpportunityComponentProps {
  "jcr:title"?: string;
  servicesPath?: string;
  stationsPath?: string;
}

export interface NewOpportunityIslandProps {
  title: string;
  apiBasePath: string;
  services: ServiceNode[];
  stations: StationNode[];
}

export interface ServiceNode {
  id: string;
  name: string;
  type: "catalog" | "card";
  children?: ServiceNode[];
}

export interface StationNode {
  id: string;
  name: string;
}
