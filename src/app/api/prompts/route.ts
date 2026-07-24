import { getPrompts, updatePrompt } from '@/lib/prompts';

export async function GET(request: Request) {
  try {
    const prompts = getPrompts();
    return Response.json(prompts);
  } catch (error) {
    console.error('Error fetching prompts:', error);
    return Response.json({ error: 'Failed to fetch prompts' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { key, value } = await request.json();

    if (!key || !value) {
      return Response.json(
        { error: 'Missing key or value' },
        { status: 400 }
      );
    }

    updatePrompt(key, value);
    return Response.json({ success: true, key, value });
  } catch (error) {
    console.error('Error updating prompt:', error);
    return Response.json(
      { error: 'Failed to update prompt' },
      { status: 500 }
    );
  }
}