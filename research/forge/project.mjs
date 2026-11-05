export const PROJECT = 'wandb/tab-to-pitch-public-data-research';
export const ENTITY = 'wandb';
export const PROJECT_NAME = 'tab-to-pitch-public-data-research';
const lookup =
  'query($entity:String!,$name:String!){viewer{username} project(entityName:$entity,name:$name){name access entityName}}';

export async function ensurePrivateProject(
  transport,
  { creationAttempt = '1', createIfMissing = true } = {},
) {
  const variables = { entity: ENTITY, name: PROJECT_NAME };
  let result = await transport.graphql(lookup, variables);
  if (!result.project) {
    if (!createIfMissing)
      throw new Error('Private research project has not been created and verified');
    await transport.graphql(
      'mutation($input:UpsertModelInput!){upsertModel(input:$input){project{name access entityName}}}',
      {
        input: {
          entityName: ENTITY,
          name: PROJECT_NAME,
          access: 'PRIVATE',
          description:
            'Public-data TabToPitch research. Licensed public music and aggregate flashcard-recall proxy results. No user score, audio, practice history, or raw learner identifiers. No guitar-learning efficacy claim.',
        },
      },
      { write: true, key: `create-private-project-${creationAttempt}` },
    );
    result = await transport.graphql(lookup, variables);
  }
  if (
    result.project?.access !== 'PRIVATE' ||
    result.project.entityName !== ENTITY ||
    result.project.name !== PROJECT_NAME
  ) {
    throw new Error('Publication requires the independently verified PRIVATE research project');
  }
  return {
    entity: ENTITY,
    project: PROJECT_NAME,
    projectId: PROJECT,
    access: result.project.access,
    authenticatedUser: result.viewer?.username,
    verifiedAt: new Date().toISOString(),
  };
}
