/**
 * Vertex credential import API
 */

import { apiClient } from './client';

export interface VertexImportResponse {
  status: 'ok';
  credential_id?: string;
  credential_ref?: string;
  credential_name?: string;
  runtime_id?: string;
  project_id?: string;
  email?: string;
  location?: string;
}

export const vertexApi = {
  importCredential: (file: File, location?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (location) {
      formData.append('location', location);
    }
    return apiClient.postForm<VertexImportResponse>('/vertex/import', formData);
  },
};
