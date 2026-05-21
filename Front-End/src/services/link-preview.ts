'use server';

import { LinkMetadata } from '@/components/chat/LinkPreviewCard';

/**
 * @fileOverview Server action to fetch metadata for shared links.
 * Returns Title, Description, and Domain only. Images are explicitly ignored.
 */
export async function getLinkMetadata(url: string): Promise<LinkMetadata | null> {
  try {
    // Basic validation
    if (!url.startsWith('http')) return null;

    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace('www.', '');
    
    // Simulation logic for common enterprise tools (Text only)
    const demoMetadata: Record<string, Partial<LinkMetadata>> = {
      'figma.com': {
        title: 'Mawby Brand Design System — Figma',
        description: 'Global brand colors, typography, and component library for Mawby Technologies team.',
      },
      'github.com': {
        title: 'mawbytec/core-app — Main Repository',
        description: 'Central workspace for Mawby Teams Chat engine. 12 open Pull Requests.',
      },
      'linear.app': {
        title: 'Q2 Sprint Planning — Linear',
        description: 'Tracking engineering progress for Q2 feature roadmap and stability milestones.',
      },
      'docs.google.com': {
        title: 'Enterprise Q2 KPI Tracker — Sheets',
        description: 'Internal performance metrics and department targets for fiscal year 2024.',
      },
      'microsoft.com': {
        title: 'Microsoft Teams | Collaborative Software',
        description: 'Empower your team to work together more effectively with integrated tools.',
      }
    };

    const result = demoMetadata[domain] || {
      title: `${domain.charAt(0).toUpperCase() + domain.slice(1).split('.')[0]} Shared Resource`,
      description: 'Shared external link for Mawby Technologies team members and collaborators.',
    };

    return {
      url: url,
      domain: domain,
      title: result.title || url,
      description: result.description,
    };
  } catch (error) {
    console.error('Metadata fetch failed:', error);
    return null;
  }
}
