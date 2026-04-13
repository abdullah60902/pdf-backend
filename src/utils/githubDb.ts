import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';

const GITHUB_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents`;

export interface FileMetadataRecord {
  originalName: string;
  cloudinaryId: string;
  url: string;
  type: string;
  size: number;
  expiresAt: string;
  createdAt?: string;
}

export class GitHubDB {
  private static async getFile(path: string) {
    try {
      const response = await axios.get(`${GITHUB_API}/${path}?ref=${GITHUB_BRANCH}`, {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
      return { data: JSON.parse(content), sha: response.data.sha };
    } catch (error: any) {
      if (error.response && error.response.status === 404) {
        return { data: null, sha: null };
      }
      throw error;
    }
  }

  private static async saveFile(path: string, data: any, sha: string | null, message: string) {
    const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');

    const body: any = {
      message,
      content,
      branch: GITHUB_BRANCH,
    };

    if (sha) {
      body.sha = sha;
    }

    const response = await axios.put(`${GITHUB_API}/${path}`, body, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
    });

    return response.data;
  }

  static async saveMetadata(metadata: FileMetadataRecord) {
    if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
      console.warn('⚠️ GitHub Database not configured. Skipping save.');
      return metadata;
    }

    try {
      const fileName = 'data/metadata.json';
      const { data, sha } = await this.getFile(fileName);

      const records = data || [];
      const newRecord = {
        ...metadata,
        createdAt: new Date().toISOString()
      };

      records.push(newRecord);

      await this.saveFile(fileName, records, sha, `Update metadata: ${metadata.originalName}`);
      console.log(`✅ Metadata saved to GitHub: ${metadata.originalName}`);
      return newRecord;
    } catch (error: any) {
      console.error('❌ Error saving to GitHub DB:', error.message);
      return metadata;
    }
  }

  static async getMetadata() {
    try {
      const { data } = await this.getFile('data/metadata.json');
      return data || [];
    } catch (error: any) {
      console.error('❌ Error fetching from GitHub DB:', error.message);
      return [];
    }
  }
}
