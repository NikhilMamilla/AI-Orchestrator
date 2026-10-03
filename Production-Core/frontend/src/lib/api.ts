import axios from 'axios';
import { signOut } from 'firebase/auth';
import { auth, getAccessToken } from './firebase';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

class ApiClient {
    private client: ReturnType<typeof axios.create>;

    constructor() {
        this.client = axios.create({
            baseURL: API_BASE_URL,
            headers: {
                'Content-Type': 'application/json',
            },
            timeout: 30000,
        });

        // Add auth token to requests
        this.client.interceptors.request.use(async (config) => {
            const token = await getAccessToken();
            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            }
            return config;
        });

        // Handle session expiry or errors
        this.client.interceptors.response.use(
            (response) => response,
            (error) => {
                if (error.response?.status === 401) {
                    void signOut(auth);      // expired/invalid session: App routes to /login
                }
                return Promise.reject(error);
            }
        );
    }

    // the server identifies the learner from the verified token: no user id is ever sent
    async getAgentActivity() {
        const response = await this.client.get('/dashboard/activity');
        return response.data;
    }

    async getAchievements() {
        const response = await this.client.get('/dashboard/achievements');
        return response.data;
    }

    async getDashboard() {
        const response = await this.client.get('/dashboard/');
        return response.data;
    }

    async getConceptMap() {
        const response = await this.client.get('/concepts/map/');
        return response.data;
    }

    // Code playground
    async runCode(sourceCode: string, language: string, stdin?: string) {
        const response = await this.client.post('/code/run/', {
            source_code: sourceCode,
            language,
            stdin: stdin || '',
        }, { timeout: 35000 }); // Judge0 can take up to 30s
        return response.data;
    }

    async getLanguages() {
        const response = await this.client.get('/code/languages/');
        return response.data;
    }
}

export const apiClient = new ApiClient();
export default apiClient;
