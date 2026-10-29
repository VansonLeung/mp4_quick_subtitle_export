import { Router } from 'express';
import { listProjects, readProject, saveProject } from '../services/project-storage.service';

export const projectRouter = Router();
projectRouter.get('/', async (_request, response, next) => {
  try {
    response.json(await listProjects());
  } catch (error) {
    next(error);
  }
});
projectRouter.get('/:id', async (request, response, next) => {
  try {
    response.json(await readProject(request.params.id));
  } catch (error) {
    next(error);
  }
});
projectRouter.post('/', async (request, response, next) => {
  try {
    response.status(201).json(await saveProject(request.body));
  } catch (error) {
    next(error);
  }
});
projectRouter.put('/:id', async (request, response, next) => {
  try {
    response.json(await saveProject(request.body, request.params.id));
  } catch (error) {
    next(error);
  }
});
