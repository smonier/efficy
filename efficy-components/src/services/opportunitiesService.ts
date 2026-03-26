import { HttpClient, resolveApiBaseUrl } from "./httpClient";

export interface CreateOpportunityInput {
  firstName: string;
  lastName: string;
  company: string;
  email: string;
  phoneNumber: string;
  serviceName: string;
  stationName: string;
  title: string;
  comment: string;
}

export class OpportunitiesService {
  private readonly httpClient: HttpClient;

  constructor(apiBasePath: string) {
    this.httpClient = new HttpClient(resolveApiBaseUrl(apiBasePath));
  }

  async createOpportunity(input: CreateOpportunityInput): Promise<void> {
    await this.httpClient.post("/opportunities", {
      firstName: input.firstName,
      lastName: input.lastName,
      company: input.company,
      email: input.email,
      phoneNumber: input.phoneNumber,
      serviceName: input.serviceName,
      stationName: input.stationName,
      title: input.title,
      comment: input.comment,
    });
  }
}
