// Action HTTP 客户端类
export class ActionClient {
  private baseUrl: string;
  
  constructor(baseUrl: string = 'http://localhost:3001') {
    this.baseUrl = baseUrl;
  }
  
  async connect(): Promise<void> {
    await fetch(`${this.baseUrl}/api/active-records`).catch(() => {});
  }
  
  private async httpRequest(method: string, endpoint: string, body?: object): Promise<any> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    
    const result = await response.json() as { error?: string };
    
    if (!response.ok) {
      throw new Error(result.error || `HTTP ${response.status}: ${response.statusText}`);
    }
    
    return result;
  }
  
  // 任务管理 API
  async createTask(name: string, description?: string, tags?: string[], logo?: string, project_path?: string): Promise<any> {
    return await this.httpRequest('POST', '/api/tasks', { name, description, tags, logo, project_path });
  }
  
  async getTask(taskId: number): Promise<any> {
    return await this.httpRequest('GET', `/api/tasks/${taskId}`);
  }
  
  async updateTask(taskId: number, updates: { name?: string; description?: string; logo?: string }): Promise<any> {
    return await this.httpRequest('PUT', `/api/tasks/${taskId}`, updates);
  }
  
  async deleteTask(taskId: number): Promise<any> {
    return await this.httpRequest('DELETE', `/api/tasks/${taskId}`);
  }
  
  async setTaskTags(taskId: number, tags: string[]): Promise<any> {
    return await this.httpRequest('PUT', `/api/tasks/${taskId}/tags`, { tags });
  }
  
  async addTaskTags(taskId: number, tags: string[]): Promise<any> {
    return await this.httpRequest('POST', `/api/tasks/${taskId}/tags/add`, { tags });
  }
  
  async removeTaskTags(taskId: number, tags: string[]): Promise<any> {
    return await this.httpRequest('POST', `/api/tasks/${taskId}/tags/remove`, { tags });
  }
  
  async getActiveTask(): Promise<any> {
    return await this.httpRequest('GET', '/api/active-task');
  }
  
  async setActiveTask(taskId: number): Promise<any> {
    return await this.httpRequest('POST', '/api/active-task', { taskId });
  }
  
  async clearActiveTask(): Promise<any> {
    return await this.httpRequest('DELETE', '/api/active-task');
  }
  
  // Action 管理 API
  async getAllActionsInfo(category?: string): Promise<any> {
    const url = category ? `/api/actions-info?category=${encodeURIComponent(category)}` : '/api/actions-info';
    return await this.httpRequest('GET', url);
  }
  
  async reloadActions(): Promise<any> {
    return await this.httpRequest('POST', '/api/actions-reload');
  }
  
  async getActionsConfig(): Promise<any> {
    return await this.httpRequest('GET', '/api/actions-config');
  }
  
  async getActionById(actionId: string): Promise<any> {
    return await this.httpRequest('GET', `/api/actions/${actionId}`);
  }
  
  async executeAction(actionId: string, input: object, settings?: object, taskId?: number): Promise<any> {
    return await this.httpRequest('POST', `/api/actions/${actionId}/execute`, { input, settings, taskId });
  }
  
  async getActionSettings(actionId: string): Promise<any> {
    return await this.httpRequest('GET', `/api/actions/${actionId}/settings`);
  }
  
  async setActionSettings(actionId: string, settings: object): Promise<any> {
    return await this.httpRequest('PUT', `/api/actions/${actionId}/settings`, { settings });
  }
  
  // 记录管理 API
  async getActiveRecords(): Promise<any> {
    return await this.httpRequest('GET', '/api/active-records');
  }
  
  async setActiveRecords(executionIds: string[]): Promise<any> {
    return await this.httpRequest('POST', '/api/active-records', { executionIds });
  }
}