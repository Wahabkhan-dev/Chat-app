'use server';
/**
 * @fileOverview A smart workspace assistant flow for Mawby Technologies.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const WorkspaceAssistantInputSchema = z.object({
  query: z.string().describe('The user question about the workspace or general help.'),
  userName: z.string().describe('The name of the user asking the question.'),
  workspaceContext: z.string().describe('Data about users, groups, and files in the workspace.')
});

export type WorkspaceAssistantInput = z.infer<typeof WorkspaceAssistantInputSchema>;

const WorkspaceAssistantOutputSchema = z.object({
  answer: z.string().describe('The response from the assistant.'),
  suggestedActions: z.array(z.string()).optional().describe('Buttons or actions the UI could show.')
});

export type WorkspaceAssistantOutput = z.infer<typeof WorkspaceAssistantOutputSchema>;

const prompt = ai.definePrompt({
  name: 'workspaceAssistantPrompt',
  input: { schema: WorkspaceAssistantInputSchema },
  output: { schema: WorkspaceAssistantOutputSchema },
  prompt: `You are the Mawby AI Assistant, a helpful and professional bot for Mawby Technologies employees.
You have access to the following workspace information:
{{{workspaceContext}}}

User asking the question: {{{userName}}}

Question: {{{query}}}

Provide a helpful, friendly, and concise response. If you don't know the answer based on the context, say so politely. Focus on helping the user navigate the workspace or find information about team members and groups.`,
});

export async function askWorkspaceAssistant(input: WorkspaceAssistantInput): Promise<WorkspaceAssistantOutput> {
  const { output } = await prompt(input);
  if (!output) throw new Error('Assistant failed to respond');
  return output;
}