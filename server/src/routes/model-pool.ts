import { Router, type Request } from "express";
import type { Db } from "@paperclipai/db";
import {
  modelPoolStateSchema,
  testProviderConnectionRequestSchema,
} from "@paperclipai/shared";
import { forbidden } from "../errors.js";
import { validate } from "../middleware/validate.js";
import { modelPoolService } from "../services/model-pool.js";
import { assertBoardOrgAccess } from "./authz.js";

function assertCanManageModelPool(req: Request) {
  if (req.actor.type !== "board") {
    throw forbidden("Board access required");
  }
  if (req.actor.source === "local_implicit" || req.actor.isInstanceAdmin) {
    return;
  }
  throw forbidden("Instance admin access required");
}

export function modelPoolRoutes(db: Db) {
  const router = Router();
  const svc = modelPoolService(db);

  router.get("/instance/model-pool", async (req, res) => {
    assertBoardOrgAccess(req);
    res.json(await svc.get());
  });

  router.put(
    "/instance/model-pool",
    validate(modelPoolStateSchema),
    async (req, res) => {
      assertCanManageModelPool(req);
      res.json(await svc.replace(req.body));
    },
  );

  router.post("/instance/model-pool/providers/:providerId/fetch-models", async (req, res) => {
    assertCanManageModelPool(req);
    res.json(await svc.fetchModelsFromProvider(req.params.providerId as string));
  });

  router.post(
    "/instance/model-pool/providers/:providerId/test-connection",
    validate(testProviderConnectionRequestSchema),
    async (req, res) => {
      assertCanManageModelPool(req);
      res.json(await svc.testProviderConnection(
        req.params.providerId as string,
        req.body.modelId,
      ));
    },
  );

  return router;
}
