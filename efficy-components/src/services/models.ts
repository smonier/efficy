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
  newsletterIds: string[];
  consentIds: string[];
  preferredMediaId: string;
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
