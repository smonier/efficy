export interface EfficyDemande {
  id: string;
  dmdId: string;
  description: string;
  status: string;
  dateCreated: string;
  priority: string;
  type?: string;
  assignedTo?: string;
  attIds?: string[];
}

export interface EfficyAttachment {
  id: string;
  name: string;
  dateCreated: string;
  mimeType?: string;
  file?: string | number[];
  size?: number;
}

export interface EfficyFaq {
  id: string;
  headerId: string;
  title: string;
  response: string;
  tags: string[];
}

export interface EfficyUserProfile {
  personId: string;
  firstName: string;
  lastName: string;
  email: string;
  civility?: string;
  title?: string;
  status?: string;
  phone?: string;
  mobile?: string;
  fax?: string;
  address1?: string;
  address2?: string;
  address3?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  company?: string;
  birthDate?: string;
  clientNumber?: string;
  loyaltyScore?: string;
  householdMembers: EfficyHouseholdMember[];
  newsletterIds: string[];
  consentIds: string[];
  preferredMediaId: string;
}

export interface EfficyHouseholdMember {
  personId?: string;
  civility?: string;
  firstName?: string;
  lastName?: string;
  status?: string;
  title?: string;
}

export interface EfficyQualification {
  id: string;
  label: string;
  description?: string;
}

export interface EfficyReferentialOption {
  id: string;
  label: string;
}

export interface EfficyBrokerOpportunity {
  OppEntID: string;
  OppPerID: string;
  OppStoID: string;
  OppStuID: string;
  OppTitle: string;
  OppDate: string;
  OppNumRef: string;
  OppGammeShouhaitee_: string[];
  OppOpbID: string;
  OppNivSouhaite_: string;
  OppRegimeAssurance_: string;
  OppStake: number;
  OppDetail: string;
}

export interface EfficyBrokerOpportunityWithDisplay extends EfficyBrokerOpportunity {
  enterpriseName: string;
  personName: string;
  personPosition: string;
  statusLabel: string;
  stateLabel: string;
  gammeLabels: string[];
  probability: number;
  protectionLevelLabel: string;
  insuranceSchemeLabel: string;
}

export interface EfficyBrokerEnterprise {
  id: string;
  name: string;
}

export interface EfficyBrokerPerson {
  id: string;
  name: string;
  functionLabel: string;
}

export interface EfficyBrokerOpportunityFormOptions {
  states: EfficyReferentialOption[];
  probabilities: EfficyReferentialOption[];
  gammes: EfficyReferentialOption[];
}

export interface EfficyBrokerCreateOpportunityInput {
  title: string;
  detail: string;
  enterpriseId: string;
  personId: string;
  stateId: string;
  probabilityId: string;
  signDate: string;
  amount: number;
  gammeIds: string[];
  courtierEntId: string;
}
