export interface UserOpportunitiesComponentProps {
  "jcr:title"?: string;
  pageSize?: number | string;
}

export interface UserOpportunitiesIslandProps {
  title: string;
  pageSize: number;
  apiBasePath: string;
  scope: "currentUser";
}
