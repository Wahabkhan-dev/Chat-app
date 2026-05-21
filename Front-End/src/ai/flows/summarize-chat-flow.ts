'use server';
/**
 * @fileOverview A flow to summarize chat conversations for Mawby Teams.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const SummarizeChatInputSchema = z.object({
  messages: z.array(z.object({
    sender: z.string(),
    text: z.string(),
    timestamp: z.string()
  })),
  context: z.string().optional().describe('Additional context about the conversation (e.g. group name)')
});

export type SummarizeChatInput = z.infer<typeof SummarizeChatInputSchema>;

const SummarizeChatOutputSchema = z.object({
  summary: z.string().describe('A concise summary of the conversation.'),
  actionItems: z.array(z.string()).describe('A list of detected action items or follow-ups.'),
  tone: z.string().describe('The overall tone of the conversation.')
});

export type SummarizeChatOutput = z.infer<typeof SummarizeChatOutputSchema>;

const prompt = ai.definePrompt({
  name: 'summarizeChatPrompt',
  input: { schema: SummarizeChatInputSchema },
  output: { schema: SummarizeChatOutputSchema },
  prompt: `You are an AI assistant for Mawby Technologies. 
Your task is to summarize a chat conversation between team members.

Context: {{{context}}}

Messages:
{{#each messages}}
- [{{{timestamp}}}] {{{sender}}}: {{{text}}}
{{/each}}

Please provide:
1. A concise summary of the main points discussed.
2. A list of any action items, tasks, or follow-ups mentioned.
3. The overall sentiment/tone of the discussion.`,
});

export async function summarizeChat(input: SummarizeChatInput): Promise<SummarizeChatOutput> {
  const { output } = await prompt(input);
  if (!output) throw new Error('Failed to generate summary');
  return output;
}