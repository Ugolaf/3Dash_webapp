import { useRef, useEffect, useState, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { generateUUID } from '../../utils/uuid';
import {
  Vector3,
  MeshBuilder,
  StandardMaterial,
  Color3,
  PositionGizmo,
  UtilityLayerRenderer,
  Color4,
  Animation,
  CubicEase,
  EasingFunction,
  Tools,
  type Mesh,
  type AbstractMesh,
  type LinesMesh,
  type Observer,
  type Scene,
} from '@babylonjs/core';
import { createScene, type SceneContext } from '../../babylon/SceneManager';
import { loadModel } from '../../babylon/ModelLoader';
import { createEdgeOutline, type EdgeOutlineControls } from '../../babylon/EdgeOutline';
import { removeLightMesh, rebuildAllMeshes, type MeshMap } from '../../babylon/LightMeshFactory';
import {
  createDisplayMesh,
  removeDisplayMesh,
  rebuildAllDisplayMeshes,
  updateDisplayTexture,
  buildMockupStates,
  type DisplayMeshMap,
} from '../../babylon/DisplayMeshFactory';
import { getConfig, updateConfig, getModelBlob, uploadModel, deleteModelBlob } from '../../services/configApi';
import { getSetting } from '../../services/settingsStore';
import { getEntityCache, setEntityCache } from '../../services/entityCache';
import { HAConnection } from '../../services/haWebSocket';
import type { HAEntityOption } from '../../components/EntityPicker';
import LightList from '../../components/LightList';
import LightForm, { type PreviewInfo, type LightFormHandle } from '../../components/LightForm';
import DisplayList from '../../components/DisplayList';
import DisplayForm, { type DisplayPreviewInfo } from '../../components/DisplayForm';
import ShadowWallList from '../../components/ShadowWallList';
import ShadowWallForm, { type WallPreviewInfo } from '../../components/ShadowWallForm';
import CoverList from '../../components/CoverList';
import CoverForm, { type CoverPreviewInfo } from '../../components/CoverForm';
import StaircaseList from '../../components/StaircaseList';
import StaircaseForm, { type StaircasePreviewInfo } from '../../components/StaircaseForm';
import CameraList from '../../components/CameraList';
import CameraForm, { type CameraOrientation } from '../../components/CameraForm';
import {
  createCameraMesh,
  removeCameraMesh,
  rebuildAllCameraMeshes,
  type CameraMeshMap,
} from '../../babylon/CameraMeshFactory';
import {
  createCoverMesh,
  removeCoverMesh,
  rebuildAllCoverMeshes,
  setCoverPosition,
  type CoverMeshMap,
} from '../../babylon/CoverMeshFactory';
import {
  createStaircaseMesh,
  removeStaircaseMesh,
  rebuildAllStaircaseMeshes,
  type StaircaseMeshMap,
} from '../../babylon/StaircaseMeshFactory';
import { getActiveFloor, getFloors } from '../../utils/floors';
import { patchFloor, createEmptyFloor, floorNameMap } from './floorHelpers';
import { arrayMove } from '@dnd-kit/sortable';
import TubeList from '../../components/TubeList';
import TubeForm, { type TubePreviewInfo } from '../../components/TubeForm';
import { createTubeMeshes, removeTubeMeshes, disposeAllTubes, renderMockupLabels, type TubeMap } from '../../babylon/TubeMeshFactory';
import GuidedTour from '../../components/GuidedTour/GuidedTour';
import { editorTourSteps } from '../../components/GuidedTour/tourSteps';
import type { LightConfig, LightGroup, DisplayConfig, ShadowWallConfig, CoverConfig, TubeConfig, StaircaseConfig, CameraConfig, FloorConfig, AppConfig, LightPosition, HAState } from '../../types';
import './ConfigEditor.css';

export default function ConfigEditor() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [showGuidedTour, setShowGuidedTour] = useState(() => searchParams.get('guided') === 'true');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneCtxRef = useRef<SceneContext | null>(null);
  const homingRef = useRef(false);
  const homeTargetRef = useRef<Vector3 | null>(null);
  /** All meshes imported by the current floor's model (disposed on floor switch). */
  const editorModelMeshesRef = useRef<AbstractMesh[]>([]);
  const editorEdgeRef = useRef<EdgeOutlineControls | null>(null);
  const floorFileRef = useRef<HTMLInputElement>(null);
  const modelSizeRef = useRef<{ x: number; z: number } | null>(null);
  const modelDiagonalRef = useRef(1);
  const meshMapRef = useRef<MeshMap>({});
  const previewMeshRef = useRef<Mesh | null>(null);
  const extraPreviewMeshesRef = useRef<Mesh[]>([]);
  const hitboxPreviewRef = useRef<Mesh | null>(null);
  const previewObsRef = useRef<Observer<Scene> | null>(null);
  const gizmoRef = useRef<PositionGizmo | null>(null);
  const utilLayerRef = useRef<UtilityLayerRenderer | null>(null);
  const draggingGizmoRef = useRef(false);
  const posUndoStackRef = useRef<LightPosition[]>([]);
  const gizmoTargetRef = useRef<'main' | { type: 'part'; index: number } | { type: 'hitbox' }>('main');
  const skipPreviewRebuildRef = useRef(false);
  const lightFormRef = useRef<LightFormHandle>(null);
  const tubeAnchorRef = useRef<Mesh | null>(null);

  const [haEntities, setHaEntities] = useState<HAEntityOption[]>(() => getEntityCache());
  const [lights, setLights] = useState<LightConfig[]>([]);
  const [lightGroups, setLightGroups] = useState<LightGroup[]>([]);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [placingMode, setPlacingMode] = useState(false);
  const [position, setPosition] = useState<LightPosition>({ x: 0, y: 2.5, z: 0 });
  const [coordText, setCoordText] = useState('x: \u2014  z: \u2014  y: \u2014');
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  // Editor mode: lights, displays, covers, walls, or tubes
  const [editorMode, setEditorMode] = useState<'lights' | 'displays' | 'covers' | 'walls' | 'tubes' | 'stairs' | 'cameras'>('lights');

  // Full config + multi-floor editing state
  const configRef = useRef<AppConfig | null>(null);
  const [floors, setFloors] = useState<FloorConfig[]>([]);
  const [editFloorId, setEditFloorId] = useState<string>('');
  const editFloorIdRef = useRef<string>('');
  editFloorIdRef.current = editFloorId;
  const floorsRef = useRef<FloorConfig[]>([]);
  floorsRef.current = floors;

  // Load HA entity list for autocomplete in forms (cache-first, else fetch fresh).
  useEffect(() => {
    if (haEntities.length > 0) return;
    const { mode, haSettings } = getSetting('connection');
    if (mode !== 'live' || !haSettings.url || !haSettings.token) return;
    const conn = new HAConnection(
      { url: haSettings.url, port: haSettings.port, token: haSettings.token },
      {
        onInitialStates: (states: HAState[]) => {
          const entities: HAEntityOption[] = states
            .map(s => ({ entity_id: s.entity_id, friendly_name: s.attributes.friendly_name as string | undefined }))
            .sort((a, b) => a.entity_id.localeCompare(b.entity_id));
          setEntityCache(entities);
          setHaEntities(entities);
          conn.dispose();
        },
      },
    );
    conn.connect();
    return () => conn.dispose();
  }, [haEntities.length]);

  // Display state
  const displayMeshMapRef = useRef<DisplayMeshMap>({});
  const [displays, setDisplays] = useState<DisplayConfig[]>([]);
  const [displayEditIdx, setDisplayEditIdx] = useState<number | null>(null);
  const [displayPanelOpen, setDisplayPanelOpen] = useState(false);
  const [displayNormal, setDisplayNormal] = useState<LightPosition>({ x: 0, y: 0, z: 1 });
  const displaysRef = useRef(displays);
  displaysRef.current = displays;
  const displayPanelOpenRef = useRef(displayPanelOpen);
  displayPanelOpenRef.current = displayPanelOpen;
  const displayPreviewIdRef = useRef<string | null>(null);
  const displayNormalRef = useRef(displayNormal);
  displayNormalRef.current = displayNormal;
  const displayOutlineRef = useRef<LinesMesh | null>(null);

  // Cover (roller shutter) state
  const coverMeshMapRef = useRef<CoverMeshMap>({});
  const [covers, setCovers] = useState<CoverConfig[]>([]);
  const [coverEditIdx, setCoverEditIdx] = useState<number | null>(null);
  const [coverPanelOpen, setCoverPanelOpen] = useState(false);
  const [coverNormal, setCoverNormal] = useState<LightPosition>({ x: 0, y: 0, z: 1 });
  const coversRef = useRef(covers);
  coversRef.current = covers;
  const coverPanelOpenRef = useRef(coverPanelOpen);
  coverPanelOpenRef.current = coverPanelOpen;
  const coverNormalRef = useRef(coverNormal);
  coverNormalRef.current = coverNormal;
  const coverPreviewIdRef = useRef<string | null>(null);
  const coverPreviewInfoRef = useRef<CoverPreviewInfo>({ width: 0.8, height: 1.2 });
  /** Curtain position (100 = open) used for editor previews so shutters stay visible. */
  const EDITOR_COVER_POSITION = 65;

  // Shadow wall state
  const [shadowWalls, setShadowWalls] = useState<ShadowWallConfig[]>([]);
  const [wallEditIdx, setWallEditIdx] = useState<number | null>(null);
  const [wallPanelOpen, setWallPanelOpen] = useState(false);
  const wallPanelOpenRef = useRef(wallPanelOpen);
  wallPanelOpenRef.current = wallPanelOpen;
  const shadowWallsRef = useRef(shadowWalls);
  shadowWallsRef.current = shadowWalls;
  // Pink wireframe meshes shown in the editor when walls tab is active
  const wallEditorMeshesRef = useRef<Mesh[]>([]);
  const wallPreviewInfoRef = useRef<WallPreviewInfo>({ size: { width: 5, height: 0.05, depth: 5 } });

  // Tube state
  const tubeMeshMapRef = useRef<TubeMap>({});
  const [tubes, setTubes] = useState<TubeConfig[]>([]);
  const [tubeEditIdx, setTubeEditIdx] = useState<number | null>(null);
  const [tubePanelOpen, setTubePanelOpen] = useState(false);
  const tubePanelOpenRef = useRef(tubePanelOpen);
  tubePanelOpenRef.current = tubePanelOpen;
  const tubesRef = useRef(tubes);
  tubesRef.current = tubes;
  const tubePreviewInfoRef = useRef<TubePreviewInfo | null>(null);

  // Staircase editor state
  const staircaseMeshMapRef = useRef<StaircaseMeshMap>({});
  const [staircases, setStaircases] = useState<StaircaseConfig[]>([]);
  const [staircaseEditIdx, setStaircaseEditIdx] = useState<number | null>(null);
  const [staircasePanelOpen, setStaircasePanelOpen] = useState(false);
  const staircasePanelOpenRef = useRef(staircasePanelOpen);
  staircasePanelOpenRef.current = staircasePanelOpen;
  const staircasesRef = useRef(staircases);
  staircasesRef.current = staircases;
  const staircasePreviewInfoRef = useRef<StaircasePreviewInfo>({ style: 'up', rotationY: 0 });
  const staircasePreviewIdRef = useRef<string | null>(null);

  // Camera editor state
  const cameraMeshMapRef = useRef<CameraMeshMap>({});
  const [cameras, setCameras] = useState<CameraConfig[]>([]);
  const [cameraEditIdx, setCameraEditIdx] = useState<number | null>(null);
  const [cameraPanelOpen, setCameraPanelOpen] = useState(false);
  const cameraPanelOpenRef = useRef(cameraPanelOpen);
  cameraPanelOpenRef.current = cameraPanelOpen;
  const camerasRef = useRef(cameras);
  camerasRef.current = cameras;
  const [cameraOrient, setCameraOrient] = useState<CameraOrientation>({ rotationY: 0, tilt: 0 });
  const cameraOrientRef = useRef(cameraOrient);
  cameraOrientRef.current = cameraOrient;
  const cameraPreviewIdRef = useRef<string | null>(null);

  // Current preview shape/size from LightForm
  const previewInfoRef = useRef<PreviewInfo>({ shape: 'sphere', size: { diameter: 0.25 } });

  // Refs for current values accessible in Babylon callbacks
  const lightsRef = useRef(lights);
  lightsRef.current = lights;
  const placingModeRef = useRef(placingMode);
  placingModeRef.current = placingMode;
  const positionRef = useRef(position);
  positionRef.current = position;
  const panelOpenRef = useRef(panelOpen);
  panelOpenRef.current = panelOpen;

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2000);
  }, []);


  // Tour event: switch back to lights tab
  useEffect(() => {
    const handler = () => setEditorMode('lights');
    document.addEventListener('tour:switch-to-lights', handler);
    return () => document.removeEventListener('tour:switch-to-lights', handler);
  }, []);

  // Preview mesh management
  const clearPreview = useCallback(() => {
    const scene = sceneCtxRef.current?.scene;
    if (previewObsRef.current && scene) {
      scene.onBeforeRenderObservable.remove(previewObsRef.current);
      previewObsRef.current = null;
    }
    if (gizmoRef.current) {
      gizmoRef.current.dispose();
      gizmoRef.current = null;
    }
    if (previewMeshRef.current) {
      previewMeshRef.current.dispose();
      previewMeshRef.current = null;
    }
    for (const m of extraPreviewMeshesRef.current) m.dispose();
    extraPreviewMeshesRef.current = [];
    if (hitboxPreviewRef.current) {
      hitboxPreviewRef.current.dispose();
      hitboxPreviewRef.current = null;
    }
    if (tubeAnchorRef.current) {
      tubeAnchorRef.current.material?.dispose();
      tubeAnchorRef.current.dispose();
      tubeAnchorRef.current = null;
    }
    // Hide any previously shown hitbox mesh
    for (const entry of Object.values(meshMapRef.current)) {
      if (entry.hitboxMesh) entry.hitboxMesh.visibility = 0;
    }
  }, []);

  // Display edit outline — purple wireframe rectangle around the display plane
  const clearDisplayOutline = useCallback(() => {
    if (displayOutlineRef.current) {
      displayOutlineRef.current.dispose();
      displayOutlineRef.current = null;
    }
  }, []);

  const showDisplayOutline = useCallback((plane: Mesh) => {
    clearDisplayOutline();
    const scene = sceneCtxRef.current?.scene;
    if (!scene) return;

    // Get the plane's local bounding extents
    const bounds = plane.getBoundingInfo().boundingBox;
    const min = bounds.minimum;
    const max = bounds.maximum;

    // Build a rectangle in local space (4 corners + close)
    const corners = [
      new Vector3(min.x, min.y, 0),
      new Vector3(max.x, min.y, 0),
      new Vector3(max.x, max.y, 0),
      new Vector3(min.x, max.y, 0),
      new Vector3(min.x, min.y, 0),
    ];

    const purple = new Color4(1, 0.2, 0.8, 1);
    const outline = MeshBuilder.CreateLines('display-outline', {
      points: corners,
      colors: corners.map(() => purple),
    }, scene);
    outline.parent = plane;
    outline.isPickable = false;
    displayOutlineRef.current = outline;
  }, [clearDisplayOutline]);

  // Build pink wireframe meshes for all shadow walls (editor only)
  const rebuildWallEditorMeshes = useCallback((walls: ShadowWallConfig[]) => {
    const scene = sceneCtxRef.current?.scene;
    if (!scene) return;
    // Dispose old
    for (const m of wallEditorMeshesRef.current) m.dispose();
    wallEditorMeshesRef.current = [];

    const mat = new StandardMaterial('wall_editor_mat', scene);
    mat.emissiveColor = new Color3(1, 0.2, 0.8);
    mat.alpha = 0.3;
    mat.wireframe = true;
    mat.disableLighting = true;

    for (const w of walls) {
      const mesh = MeshBuilder.CreateBox(`wall_editor_${w.id}`, {
        width: w.size.width,
        height: w.size.height,
        depth: w.size.depth,
      }, scene);
      mesh.position = new Vector3(w.position.x, w.position.y, w.position.z);
      mesh.material = mat;
      mesh.isPickable = false;
      wallEditorMeshesRef.current.push(mesh);
    }
  }, []);

  const disposeWallEditorMeshes = useCallback(() => {
    for (const m of wallEditorMeshesRef.current) m.dispose();
    wallEditorMeshesRef.current = [];
  }, []);

  const updatePreviewMesh = useCallback(
    (pos: LightPosition, shapeType: string, sizeOverrides: Record<string, number>, hitboxInfo?: { shape: string; size: Record<string, number>; position: LightPosition }, partsInfo?: Array<{ shape: string; size: Record<string, number>; position: LightPosition }>) => {
      const scene = sceneCtxRef.current?.scene;
      if (!scene) return;
      clearPreview();

      const mat = new StandardMaterial('preview-mat', scene);
      mat.emissiveColor = new Color3(0.2, 0.7, 1.0);
      mat.alpha = 0.7;
      mat.disableLighting = true;

      const createPreviewShape = (name: string, sh: string, sz: Record<string, number>, p: LightPosition): Mesh => {
        let m: Mesh;
        if (sh === 'cube') {
          m = MeshBuilder.CreateBox(name, {
            width: sz.width ?? 0.3,
            height: sz.height ?? 0.3,
            depth: sz.depth ?? 0.3,
          }, scene);
        } else {
          m = MeshBuilder.CreateSphere(name, {
            diameter: sz.diameter ?? 0.25,
          }, scene);
        }
        m.position = new Vector3(p.x, p.y, p.z);
        m.isPickable = true;
        m.material = mat;
        return m;
      };

      let mesh: Mesh;
      if (partsInfo && partsInfo.length > 0) {
        // Multi-part preview
        mesh = createPreviewShape('preview_0', partsInfo[0].shape, partsInfo[0].size, partsInfo[0].position);
        mesh.metadata = { previewTarget: 'part', partIndex: 0 };
        for (let i = 1; i < partsInfo.length; i++) {
          const extra = createPreviewShape(`preview_${i}`, partsInfo[i].shape, partsInfo[i].size, partsInfo[i].position);
          extra.metadata = { previewTarget: 'part', partIndex: i };
          extraPreviewMeshesRef.current.push(extra);
        }
      } else {
        mesh = createPreviewShape('preview', shapeType, sizeOverrides, pos);
        mesh.metadata = { previewTarget: 'main' };
      }

      // Create hitbox preview if custom hitbox is enabled
      if (hitboxInfo) {
        let hbMesh: Mesh;
        if (hitboxInfo.shape === 'cube') {
          hbMesh = MeshBuilder.CreateBox('hitbox-preview', {
            width: hitboxInfo.size.width ?? 0.5,
            height: hitboxInfo.size.height ?? 0.5,
            depth: hitboxInfo.size.depth ?? 0.5,
          }, scene);
        } else {
          hbMesh = MeshBuilder.CreateSphere('hitbox-preview', {
            diameter: hitboxInfo.size.diameter ?? 0.5,
          }, scene);
        }
        const hbPos = hitboxInfo.position;
        hbMesh.position = new Vector3(hbPos.x, hbPos.y, hbPos.z);
        hbMesh.isPickable = true;
        hbMesh.metadata = { previewTarget: 'hitbox' };
        const hbMat = new StandardMaterial('hitbox-preview-mat', scene);
        hbMat.emissiveColor = new Color3(1, 0.2, 0.8); // magenta
        hbMat.alpha = 0.3;
        hbMat.wireframe = true;
        hbMat.disableLighting = true;
        hbMesh.material = hbMat;
        hitboxPreviewRef.current = hbMesh;
      }

      // Pulse animation
      let t = 0;
      previewObsRef.current = scene.onBeforeRenderObservable.add(() => {
        t += 0.05;
        mat.alpha = 0.5 + 0.25 * Math.sin(t);
      });

      previewMeshRef.current = mesh;
      gizmoTargetRef.current = partsInfo?.length ? { type: 'part', index: 0 } : 'main';

      // Attach position gizmo (RGB XYZ handles)
      if (!utilLayerRef.current) {
        utilLayerRef.current = new UtilityLayerRenderer(scene);
      }
      const gizmo = new PositionGizmo(utilLayerRef.current);
      gizmo.scaleRatio = 1.2;
      gizmo.attachedMesh = mesh;

      // Sync position back to React state on drag
      const onDragStart = () => {
        draggingGizmoRef.current = true;
        const target = gizmoTargetRef.current;
        if (target === 'main' || (typeof target === 'object' && target.type === 'part' && target.index === 0 && !(previewInfoRef.current.parts?.length))) {
          posUndoStackRef.current.push({ ...positionRef.current });
        }
      };
      const onDrag = () => {
        const target = gizmoTargetRef.current;
        // Only sync main light position to React state during drag
        if (target === 'main') {
          const p = mesh.position;
          const newPos: LightPosition = {
            x: parseFloat(p.x.toFixed(3)),
            y: parseFloat(p.y.toFixed(3)),
            z: parseFloat(p.z.toFixed(3)),
          };
          positionRef.current = newPos;
          setPosition(newPos);
        }
        // For part/hitbox targets, the mesh moves via gizmo — no state update during drag
      };
      const onDragEnd = () => {
        draggingGizmoRef.current = false;
        document.dispatchEvent(new Event('tour:gizmo-used'));
        const target = gizmoTargetRef.current;
        if (target !== 'main' && gizmo.attachedMesh) {
          const p = gizmo.attachedMesh.position;
          const newPos: LightPosition = {
            x: parseFloat(p.x.toFixed(3)),
            y: parseFloat(p.y.toFixed(3)),
            z: parseFloat(p.z.toFixed(3)),
          };
          skipPreviewRebuildRef.current = true;
          if (typeof target === 'object' && target.type === 'part') {
            lightFormRef.current?.updatePartPosition(target.index, newPos);
          } else if (typeof target === 'object' && target.type === 'hitbox') {
            lightFormRef.current?.updateHitboxPosition(newPos);
          }
        }
      };
      for (const ax of [gizmo.xGizmo, gizmo.yGizmo, gizmo.zGizmo]) {
        ax.dragBehavior.onDragStartObservable.add(onDragStart);
        ax.dragBehavior.onDragObservable.add(onDrag);
        ax.dragBehavior.onDragEndObservable.add(onDragEnd);
      }
      // Make gizmo arrows semi-transparent
      for (const m of utilLayerRef.current!.utilityLayerScene.meshes) {
        if (m.material) {
          (m.material as StandardMaterial).alpha = 0.5;
        }
      }

      gizmoRef.current = gizmo;
    },
    [clearPreview],
  );

  // Placing mode
  const enterPlacingMode = useCallback(() => {
    setPlacingMode(true);
    const ctx = sceneCtxRef.current;
    if (ctx) {
      ctx.camera.inputs.removeByType('ArcRotateCameraPointersInput');
      if (canvasRef.current) canvasRef.current.style.cursor = 'crosshair';
    }
  }, []);

  const exitPlacingMode = useCallback(() => {
    setPlacingMode(false);
    const ctx = sceneCtxRef.current;
    if (ctx && canvasRef.current) {
      ctx.camera.inputs.addPointers();
      ctx.camera.attachControl(canvasRef.current, true);
      canvasRef.current.style.cursor = 'default';
    }
  }, []);

  const computeIdealRadius = useCallback(() => {
    const canvas = canvasRef.current;
    const ms = modelSizeRef.current;
    const camera = sceneCtxRef.current?.camera;
    if (!canvas || !ms || !camera) return modelDiagonalRef.current * 1.6;
    const fov = camera.fov;
    const aspect = canvas.clientWidth / canvas.clientHeight;
    const radiusForHeight = (ms.z / 2) / (Math.tan(fov / 2) * 0.75);
    const radiusForWidth = (ms.x / 2) / (Math.tan(fov / 2) * aspect * 0.75);
    return Math.max(radiusForHeight, radiusForWidth);
  }, []);

  // ── Multi-floor editing ────────────────────────────────────────

  /** Persist a partial update to the floor currently being edited. */
  const persistActiveFloor = useCallback((patch: Partial<FloorConfig>) => {
    const config = configRef.current;
    if (!config) return;
    const updated = patchFloor(getFloors(config), editFloorIdRef.current, patch);
    configRef.current = { ...config, floors: updated };
    setFloors(updated);
    try { updateConfig({ floors: updated }); } catch (e) {
      console.warn('[Config] Failed to persist floor:', e);
    }
  }, []);

  /**
   * Dispose the current floor's editor meshes, load a floor's model + entities
   * into the scene and mirror them into the editor state. Used on init and on
   * every floor switch (keeps the two paths in sync — one source of truth).
   */
  const loadFloorIntoEditor = useCallback(async (floorCfg: FloorConfig) => {
    const ctx = sceneCtxRef.current;
    if (!ctx) return;

    // Dispose the previous floor
    Object.keys(meshMapRef.current).forEach((id) => removeLightMesh(meshMapRef.current, id));
    Object.keys(displayMeshMapRef.current).forEach((id) => removeDisplayMesh(displayMeshMapRef.current, id));
    Object.keys(coverMeshMapRef.current).forEach((id) => removeCoverMesh(ctx.scene, coverMeshMapRef.current, id));
    disposeAllTubes(tubeMeshMapRef.current);
    Object.keys(staircaseMeshMapRef.current).forEach((id) => removeStaircaseMesh(ctx.scene, staircaseMeshMapRef.current, id));
    Object.keys(cameraMeshMapRef.current).forEach((id) => removeCameraMesh(ctx.scene, cameraMeshMapRef.current, id));
    for (const m of editorModelMeshesRef.current) m.dispose();
    editorModelMeshesRef.current = [];
    editorEdgeRef.current?.dispose();
    editorEdgeRef.current = null;

    // Mirror the floor's entities into editor state
    setLights(floorCfg.lights || []); lightsRef.current = floorCfg.lights || [];
    setLightGroups(floorCfg.lightGroups || []);
    setDisplays(floorCfg.displays || []); displaysRef.current = floorCfg.displays || [];
    setShadowWalls(floorCfg.shadowWalls || []); shadowWallsRef.current = floorCfg.shadowWalls || [];
    setCovers(floorCfg.covers || []); coversRef.current = floorCfg.covers || [];
    setTubes(floorCfg.tubes || []); tubesRef.current = floorCfg.tubes || [];
    setStaircases(floorCfg.staircases || []); staircasesRef.current = floorCfg.staircases || [];
    setCameras(floorCfg.cameras || []); camerasRef.current = floorCfg.cameras || [];

    // Load the floor's model
    const modelBlob = await getModelBlob(floorCfg.modelId);
    if (!modelBlob) {
      showToast(`Floor "${floorCfg.name}" has no model yet — upload one`);
      return;
    }
    const result = await loadModel(ctx.scene, modelBlob);
    editorModelMeshesRef.current = result.meshes;
    const modelMeshes = result.meshes.filter((m) => m.getTotalVertices?.() > 0);
    editorEdgeRef.current = createEdgeOutline(ctx.scene, ctx.camera, { meshes: modelMeshes });

    const target = result.center.clone();
    target.y = 0;
    homeTargetRef.current = target.clone();
    ctx.camera.target = target;
    ctx.camera.alpha = Tools.ToRadians(270);
    ctx.camera.beta = Tools.ToRadians(0.5);
    ctx.camera.lowerRadiusLimit = result.diagonal * 0.27;
    ctx.camera.upperRadiusLimit = result.diagonal * 3;
    modelSizeRef.current = { x: result.size.x, z: result.size.z };
    modelDiagonalRef.current = result.diagonal;
    ctx.camera.radius = computeIdealRadius();

    // Rebuild entity editor meshes
    rebuildAllMeshes(ctx.scene, meshMapRef.current, floorCfg.lights || []);
    rebuildAllDisplayMeshes(ctx.scene, displayMeshMapRef.current, floorCfg.displays || []);
    for (const entry of Object.values(displayMeshMapRef.current)) {
      entry.plane.isPickable = true;
      updateDisplayTexture(entry, buildMockupStates(floorCfg.displays || []));
    }
    rebuildAllCoverMeshes(ctx.scene, coverMeshMapRef.current, floorCfg.covers || [], EDITOR_COVER_POSITION);
    for (const tc of (floorCfg.tubes || [])) {
      tubeMeshMapRef.current[tc.id] = createTubeMeshes(ctx.scene, tc, null);
    }
    renderMockupLabels(tubeMeshMapRef.current);
    rebuildAllStaircaseMeshes(ctx.scene, staircaseMeshMapRef.current, floorCfg.staircases || []);
    rebuildAllCameraMeshes(ctx.scene, cameraMeshMapRef.current, floorCfg.cameras || []);
  }, [computeIdealRadius, showToast]);

  /** Switch which floor is being edited (persists nothing — edits auto-save). */
  const switchEditFloor = useCallback(async (floorId: string) => {
    const config = configRef.current;
    if (!config || floorId === editFloorIdRef.current) return;
    const target = getFloors(config).find((f) => f.id === floorId);
    if (!target) return;
    // Close any open editor panels
    clearPreview();
    exitPlacingMode();
    setPanelOpen(false); setDisplayPanelOpen(false); setCoverPanelOpen(false);
    setWallPanelOpen(false); setTubePanelOpen(false); setStaircasePanelOpen(false); setCameraPanelOpen(false);
    setEditIdx(null); setDisplayEditIdx(null); setCoverEditIdx(null);
    setWallEditIdx(null); setTubeEditIdx(null); setStaircaseEditIdx(null); setCameraEditIdx(null);
    setEditFloorId(floorId);
    editFloorIdRef.current = floorId;
    await loadFloorIntoEditor(target);
  }, [clearPreview, exitPlacingMode, loadFloorIntoEditor]);

  // Initialize scene
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    const ctx = createScene(canvas);
    sceneCtxRef.current = ctx;

    async function init() {
      try {
        const config = await getConfig();
        if (disposed) return;
        configRef.current = config;
        const floorList = getFloors(config);
        const active = getActiveFloor(config);
        setFloors(floorList);
        setEditFloorId(active.id);
        editFloorIdRef.current = active.id;

        // Editor needs at least one model — if the active floor has none, bail.
        const modelBlob = await getModelBlob(active.modelId);
        if (disposed) return;
        if (!modelBlob) {
          navigate('/onboarding');
          return;
        }
        await loadFloorIntoEditor(active);
      } catch (e) {
        if (!disposed) console.warn('[Editor] Init error:', e);
      }
    }

    // Pointer move — coordinate readout
    ctx.scene.onPointerMove = (_evt, pick) => {
      if (pick.hit && pick.pickedPoint) {
        const p = pick.pickedPoint;
        setCoordText(`x: ${p.x.toFixed(2)}  z: ${p.y.toFixed(2)}  y: ${p.z.toFixed(2)}`);
        if (placingModeRef.current && canvas) canvas.style.cursor = 'crosshair';
      } else {
        setCoordText('x: \u2014  z: \u2014  y: \u2014');
        if (!placingModeRef.current && canvas) canvas.style.cursor = 'default';
      }
    };

    // Track pointer start position to distinguish clicks from drags
    let pointerDownPos: { x: number; y: number } | null = null;
    const DRAG_THRESHOLD = 6; // pixels — beyond this it's a rotation, not a click

    // Click to place or click light/display mesh to edit
    ctx.scene.onPointerDown = (evt, pick) => {
      pointerDownPos = { x: evt.clientX, y: evt.clientY };

      if (placingModeRef.current) {
        // Re-pick excluding preview meshes (and cover hitboxes, which float off the wall)
        const placePick = ctx.scene.pick(
          evt.offsetX,
          evt.offsetY,
          (m) => !m.metadata?.previewTarget && !m.name.startsWith('cover_hitbox_'),
        );
        if (!placePick.hit || !placePick.pickedPoint) return;
        posUndoStackRef.current.push({ ...positionRef.current });
        const p = placePick.pickedPoint;

        // Display placing mode: capture normal
        if (displayPanelOpenRef.current) {
          const faceNormal = placePick.getNormal(true, true);
          const n = faceNormal
            ? { x: parseFloat(faceNormal.x.toFixed(4)), y: parseFloat(faceNormal.y.toFixed(4)), z: parseFloat(faceNormal.z.toFixed(4)) }
            : { x: 0, y: 0, z: 1 };
          setDisplayNormal(n);
          const newPos: LightPosition = {
            x: parseFloat(p.x.toFixed(3)),
            y: parseFloat(p.y.toFixed(3)),
            z: parseFloat(p.z.toFixed(3)),
          };
          setPosition(newPos);
          positionRef.current = newPos;
        } else if (coverPanelOpenRef.current) {
          // Cover placing mode: capture the wall normal, flattened to horizontal
          // (shutters mount on vertical walls)
          const faceNormal = placePick.getNormal(true, true);
          if (faceNormal) {
            const len = Math.hypot(faceNormal.x, faceNormal.z);
            if (len > 0.3) {
              const n = {
                x: parseFloat((faceNormal.x / len).toFixed(4)),
                y: 0,
                z: parseFloat((faceNormal.z / len).toFixed(4)),
              };
              setCoverNormal(n);
              coverNormalRef.current = n;
            }
          }
          const newPos: LightPosition = {
            x: parseFloat(p.x.toFixed(3)),
            y: parseFloat(p.y.toFixed(3)),
            z: parseFloat(p.z.toFixed(3)),
          };
          setPosition(newPos);
          positionRef.current = newPos;
        } else if (cameraPanelOpenRef.current) {
          // Camera placing mode: auto-orient from the clicked surface normal
          // (ceiling → dome down, wall → dome horizontal facing into the room).
          const faceNormal = placePick.getNormal(true, true);
          if (faceNormal) {
            // Interior face normals point into the room → the dome looks that way.
            // Matches CameraMeshFactory: dome dir = (−sinθ·sinφ, −cosθ, −sinθ·cosφ).
            const look = faceNormal.normalize();
            const tilt = Math.acos(Math.min(Math.max(-look.y, -1), 1));
            const yaw = Math.atan2(-look.x, -look.z);
            const orient = { rotationY: parseFloat(yaw.toFixed(4)), tilt: parseFloat(tilt.toFixed(4)) };
            setCameraOrient(orient);
            cameraOrientRef.current = orient;
          }
          const newPos: LightPosition = {
            x: parseFloat(p.x.toFixed(3)),
            y: parseFloat(p.y.toFixed(3)),
            z: parseFloat(p.z.toFixed(3)),
          };
          setPosition(newPos);
          positionRef.current = newPos;
        } else if (wallPanelOpenRef.current || staircasePanelOpenRef.current) {
          // Wall / staircase placing mode: exact position, no offset
          const newPos: LightPosition = {
            x: parseFloat(p.x.toFixed(3)),
            y: parseFloat(p.y.toFixed(3)),
            z: parseFloat(p.z.toFixed(3)),
          };
          setPosition(newPos);
          positionRef.current = newPos;
        } else {
          // Light placing mode: offset Y slightly
          const newPos: LightPosition = {
            x: parseFloat(p.x.toFixed(3)),
            y: parseFloat((p.y + 0.2).toFixed(3)),
            z: parseFloat(p.z.toFixed(3)),
          };
          setPosition(newPos);
          positionRef.current = newPos;
        }

        setPlacingMode(false);
        document.dispatchEvent(new Event('tour:entity-placed'));
        // Re-enable camera
        ctx.camera.inputs.addPointers();
        ctx.camera.attachControl(canvas, true);
        if (canvas) canvas.style.cursor = 'default';
        return;
      }
    };

    ctx.scene.onPointerUp = (evt) => {
      // Only treat as a click if the pointer barely moved
      if (!pointerDownPos) return;
      const dx = evt.clientX - pointerDownPos.x;
      const dy = evt.clientY - pointerDownPos.y;
      pointerDownPos = null;
      if (dx * dx + dy * dy > DRAG_THRESHOLD * DRAG_THRESHOLD) return;

      // When editing a light, allow clicking preview meshes to switch gizmo target
      if (panelOpenRef.current) {
        const gizmo = gizmoRef.current;
        if (gizmo) {
          // Multi-pick to find all preview meshes under cursor, prioritize parts/main over hitbox
          const hits = ctx.scene.multiPick(evt.offsetX, evt.offsetY, (m) => !!m.metadata?.previewTarget);
          if (hits && hits.length > 0) {
            // Prefer part/main over hitbox (lights are often inside the hitbox)
            const sorted = hits
              .filter((h) => h.hit && h.pickedMesh)
              .sort((a, b) => {
                const aPri = a.pickedMesh!.metadata.previewTarget === 'hitbox' ? 1 : 0;
                const bPri = b.pickedMesh!.metadata.previewTarget === 'hitbox' ? 1 : 0;
                return aPri - bPri;
              });
            if (sorted.length > 0) {
              const meta = sorted[0].pickedMesh!.metadata;
              gizmo.attachedMesh = sorted[0].pickedMesh as Mesh;
              if (meta.previewTarget === 'main') {
                gizmoTargetRef.current = 'main';
              } else if (meta.previewTarget === 'part') {
                gizmoTargetRef.current = { type: 'part', index: meta.partIndex };
              } else if (meta.previewTarget === 'hitbox') {
                gizmoTargetRef.current = { type: 'hitbox' };
              }
            }
          }
        }
        return;
      }
      // Skip click-to-edit when already editing another entity
      if (displayPanelOpenRef.current || coverPanelOpenRef.current || wallPanelOpenRef.current || tubePanelOpenRef.current || staircasePanelOpenRef.current || cameraPanelOpenRef.current) return;

      // Pick under pointer
      const pick = ctx.scene.pick(evt.offsetX, evt.offsetY);
      if (!pick?.hit) return;

      // Click on a light bulb mesh (or cover mesh) to edit it
      if (pick.pickedMesh?.metadata?.entityId) {
        const clickedId = pick.pickedMesh.metadata.entityId;
        const idx = lightsRef.current.findIndex((l) => l.entityId === clickedId);
        if (idx !== -1) {
          handleEditLightRef.current(idx);
        } else {
          const coverIdx = coversRef.current.findIndex((c) => c.entityId === clickedId);
          if (coverIdx !== -1) {
            handleEditCoverRef.current(coverIdx);
          }
        }
      }

      // Click on a display mesh to edit it
      if (pick.pickedMesh?.metadata?.displayId) {
        const clickedId = pick.pickedMesh.metadata.displayId;
        const idx = displaysRef.current.findIndex((d) => d.id === clickedId);
        if (idx !== -1) {
          handleEditDisplayRef.current(idx);
        }
      }

      // Click on a tube mesh to edit it
      if (pick.pickedMesh?.metadata?.tubeId) {
        const clickedId = pick.pickedMesh.metadata.tubeId;
        const idx = tubesRef.current.findIndex((t) => t.id === clickedId);
        if (idx !== -1) {
          handleEditTubeRef.current(idx);
        }
      }

      // Click on a staircase to edit it
      if (pick.pickedMesh?.metadata?.staircaseId) {
        const clickedId = pick.pickedMesh.metadata.staircaseId;
        const idx = staircasesRef.current.findIndex((s) => s.id === clickedId);
        if (idx !== -1) {
          handleEditStaircaseRef.current(idx);
        }
      }

      // Click on a camera to edit it
      if (pick.pickedMesh?.metadata?.cameraId) {
        const clickedId = pick.pickedMesh.metadata.cameraId;
        const idx = camerasRef.current.findIndex((c) => c.id === clickedId);
        if (idx !== -1) {
          handleEditCameraRef.current(idx);
        }
      }
    };

    init();

    return () => {
      disposed = true;
      Object.keys(meshMapRef.current).forEach((id) =>
        removeLightMesh(meshMapRef.current, id),
      );
      Object.keys(displayMeshMapRef.current).forEach((id) =>
        removeDisplayMesh(displayMeshMapRef.current, id),
      );
      Object.keys(coverMeshMapRef.current).forEach((id) =>
        removeCoverMesh(ctx.scene, coverMeshMapRef.current, id),
      );
      disposeAllTubes(tubeMeshMapRef.current);
      Object.keys(staircaseMeshMapRef.current).forEach((id) =>
        removeStaircaseMesh(ctx.scene, staircaseMeshMapRef.current, id),
      );
      Object.keys(cameraMeshMapRef.current).forEach((id) =>
        removeCameraMesh(ctx.scene, cameraMeshMapRef.current, id),
      );
      clearPreview();
      for (const m of wallEditorMeshesRef.current) m.dispose();
      wallEditorMeshesRef.current = [];
      if (utilLayerRef.current) {
        utilLayerRef.current.dispose();
        utilLayerRef.current = null;
      }
      ctx.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update preview mesh when position changes and panel is open
  useEffect(() => {
    if (!panelOpen) return;
    // If the position change came from a gizmo drag, just sync mesh position (no rebuild)
    if (draggingGizmoRef.current && previewMeshRef.current) {
      previewMeshRef.current.position.set(position.x, position.y, position.z);
      return;
    }
    const info = previewInfoRef.current;
    updatePreviewMesh(position, info.shape, info.size, info.hitbox, info.parts);
  }, [position, panelOpen, updatePreviewMesh]);

  // Update display preview mesh position when position changes (skip during gizmo drag)
  useEffect(() => {
    if (!displayPanelOpen || !displayPreviewIdRef.current) return;
    if (draggingGizmoRef.current) return;
    const entry = displayMeshMapRef.current[displayPreviewIdRef.current];
    if (!entry) return;
    const normal = new Vector3(displayNormal.x, displayNormal.y, displayNormal.z).normalize();
    entry.plane.position.set(
      position.x + normal.x * 0.005,
      position.y + normal.y * 0.005,
      position.z + normal.z * 0.005,
    );
  }, [position, displayPanelOpen, displayNormal]);

  // Wrap setPosition for slider changes: push undo entry on first change after idle
  const sliderIdleRef = useRef(true);
  const sliderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlePositionChange = useCallback((newPos: LightPosition) => {
    if (sliderIdleRef.current) {
      // First change after idle — snapshot current position
      posUndoStackRef.current.push({ ...positionRef.current });
      sliderIdleRef.current = false;
    }
    // Reset idle timer — mark idle after 400ms of no changes
    if (sliderTimerRef.current) clearTimeout(sliderTimerRef.current);
    sliderTimerRef.current = setTimeout(() => { sliderIdleRef.current = true; }, 400);
    setPosition(newPos);
  }, []);

  // Show/hide wall editor meshes when switching to/from walls tab
  useEffect(() => {
    if (editorMode === 'walls') {
      rebuildWallEditorMeshes(shadowWalls);
    } else {
      disposeWallEditorMeshes();
    }
  }, [editorMode, shadowWalls, rebuildWallEditorMeshes, disposeWallEditorMeshes]);

  // Keyboard shortcuts: Ctrl+Z undo, Escape close panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip shortcuts when typing in an input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable) return;

      // Ctrl+Z undo (must check before the modifier guard)
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        if (!panelOpenRef.current && !displayPanelOpenRef.current && !coverPanelOpenRef.current && !wallPanelOpenRef.current && !tubePanelOpenRef.current && !staircasePanelOpenRef.current && !cameraPanelOpenRef.current) return;
        const stack = posUndoStackRef.current;
        if (stack.length === 0) return;
        e.preventDefault();
        const prev = stack.pop()!;
        setPosition(prev);
        positionRef.current = prev;
        return;
      }

      // Skip single-key shortcuts when a modifier key is held (allow native Ctrl+C, etc.)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === 'c') {
        navigate('/');
        return;
      }
      if (e.key === ' ') {
        e.preventDefault();
        const ctx = sceneCtxRef.current;
        const homeTarget = homeTargetRef.current;
        if (!ctx || !homeTarget || homingRef.current) return;
        const { camera, scene } = ctx;
        homingRef.current = true;
        camera.detachControl();

        const fps = 60;
        const frames = 45;
        const ease = new CubicEase();
        ease.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT);

        const makeAnim = (prop: string, from: number, to: number) => {
          const a = new Animation(`home_${prop}`, prop, fps, Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CONSTANT);
          a.setKeys([{ frame: 0, value: from }, { frame: frames, value: to }]);
          a.setEasingFunction(ease);
          return a;
        };

        const targetRadius = computeIdealRadius();
        const targetAlpha = Tools.ToRadians(270);
        const targetBeta = Tools.ToRadians(0.5);
        const targetPos = homeTarget.clone();

        // Skip if already at home — avoids detach/reattach glitch
        const EPS = 0.002;
        if (
          Math.abs(camera.radius - targetRadius) < EPS &&
          Math.abs(camera.alpha - targetAlpha) < EPS &&
          Math.abs(camera.beta - targetBeta) < EPS &&
          Vector3.Distance(camera.target, targetPos) < EPS
        ) {
          homingRef.current = false;
          camera.attachControl(true);
          return;
        }

        const targetAnim = new Animation('home_target', 'target', fps, Animation.ANIMATIONTYPE_VECTOR3, Animation.ANIMATIONLOOPMODE_CONSTANT);
        targetAnim.setKeys([{ frame: 0, value: camera.target.clone() }, { frame: frames, value: targetPos }]);
        targetAnim.setEasingFunction(ease);

        camera.animations = [
          makeAnim('radius', camera.radius, targetRadius),
          makeAnim('alpha', camera.alpha, targetAlpha),
          makeAnim('beta', camera.beta, targetBeta),
          targetAnim,
        ];

        scene.beginAnimation(camera, 0, frames, false, 1, () => {
          camera.attachControl(true);
          homingRef.current = false;
        });
        return;
      }
      if (e.key === 'Escape') {
        if (panelOpenRef.current) {
          e.preventDefault();
          handleClosePanelRef.current();
          return;
        }
        if (displayPanelOpenRef.current) {
          e.preventDefault();
          handleCloseDisplayPanelRef.current();
          return;
        }
        if (coverPanelOpenRef.current) {
          e.preventDefault();
          handleCloseCoverPanelRef.current();
          return;
        }
        if (wallPanelOpenRef.current) {
          e.preventDefault();
          handleCloseWallPanelRef.current();
          return;
        }
        if (tubePanelOpenRef.current) {
          e.preventDefault();
          handleCloseTubePanelRef.current();
          return;
        }
        if (staircasePanelOpenRef.current) {
          e.preventDefault();
          handleCloseStaircasePanelRef.current();
          return;
        }
        if (cameraPanelOpenRef.current) {
          e.preventDefault();
          handleCloseCameraPanelRef.current();
          return;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle shape/size changes from LightForm
  const handlePreviewChange = useCallback(
    (info: PreviewInfo) => {
      previewInfoRef.current = info;
      // Skip rebuild when the change came from a gizmo drag on a part/hitbox
      if (skipPreviewRebuildRef.current) {
        skipPreviewRebuildRef.current = false;
        return;
      }
      if (panelOpen) {
        updatePreviewMesh(position, info.shape, info.size, info.hitbox, info.parts);
      }
    },
    [panelOpen, position, updatePreviewMesh],
  );

  // Open panel for new light
  const handleAddLight = useCallback(() => {
    setEditIdx(null);
    setPosition({ x: 0, y: 2.5, z: 0 });
    posUndoStackRef.current = [];
    setPanelOpen(true);
  }, []);

  // Edit existing light
  const handleEditLight = useCallback(
    (idx: number) => {
      // Hide any previously visible hitbox
      for (const entry of Object.values(meshMapRef.current)) {
        if (entry.hitboxMesh) entry.hitboxMesh.visibility = 0;
      }
      const cfg = lights[idx];
      // Show hitbox for the light being edited
      const entry = meshMapRef.current[cfg.entityId];
      if (entry?.hitboxMesh) {
        entry.hitboxMesh.visibility = 1;
      }
      setEditIdx(idx);
      setPosition(cfg.position);
      posUndoStackRef.current = [];
      setPanelOpen(true);
    },
    [lights],
  );

  // Ref so Babylon callbacks can call handleEditLight
  const handleEditLightRef = useRef(handleEditLight);
  handleEditLightRef.current = handleEditLight;

  // Delete light (and auto-save to server)
  const handleDeleteLight = useCallback(
    async (idx: number) => {
      const scene = sceneCtxRef.current?.scene;
      if (!scene) return;
      const id = lights[idx].entityId;
      removeLightMesh(meshMapRef.current, id);
      const updated = lights.filter((_, i) => i !== idx);
      setLights(updated);
      rebuildAllMeshes(scene, meshMapRef.current, updated);

      try {
        persistActiveFloor({ lights: updated });
        showToast('Light deleted & synced to server');
      } catch (e) {
        console.error('[Config] Auto-save failed:', e);
        showToast('Light deleted locally (server sync failed)');
      }
    },
    [lights, showToast],
  );

  // Duplicate light
  const handleDuplicateLight = useCallback(
    async (idx: number) => {
      const scene = sceneCtxRef.current?.scene;
      if (!scene) return;
      const src = lights[idx];
      const copy: LightConfig = {
        ...src,
        entityId: src.entityId + '_copy',
        label: (src.label || src.entityId) + ' (copy)',
        position: {
          x: src.position.x + 0.3,
          y: src.position.y,
          z: src.position.z,
        },
      };
      const updated = [...lights, copy];
      setLights(updated);
      rebuildAllMeshes(scene, meshMapRef.current, updated);

      try {
        persistActiveFloor({ lights: updated });
        showToast('Light duplicated & synced to server');
      } catch (e) {
        console.error('[Config] Auto-save failed:', e);
        showToast('Light duplicated locally (server sync failed)');
      }
    },
    [lights, showToast],
  );

  // Reorder light in list
  const handleReorderLight = useCallback(
    async (fromIdx: number, toIdx: number) => {
      const updated = arrayMove(lights, fromIdx, toIdx);
      setLights(updated);
      // Adjust editIdx to follow the selected light
      if (editIdx !== null) {
        if (editIdx === fromIdx) {
          setEditIdx(toIdx);
        } else if (fromIdx < editIdx && toIdx >= editIdx) {
          setEditIdx(editIdx - 1);
        } else if (fromIdx > editIdx && toIdx <= editIdx) {
          setEditIdx(editIdx + 1);
        }
      }
      try {
        persistActiveFloor({ lights: updated });
      } catch (e) {
        console.error('[Config] Reorder save failed:', e);
      }
    },
    [lights, editIdx],
  );

  // Move light to a group
  const handleMoveToGroup = useCallback(
    async (lightIdx: number, groupId: string | undefined) => {
      const updated = lights.map((l, i) =>
        i === lightIdx ? { ...l, group: groupId } : l,
      );
      setLights(updated);
      try {
        persistActiveFloor({ lights: updated });
      } catch (e) {
        console.error('[Config] Move-to-group save failed:', e);
      }
    },
    [lights],
  );

  // Group CRUD
  const handleAddGroup = useCallback(
    async (name: string) => {
      const newGroup: LightGroup = { id: generateUUID(), name };
      const updated = [...lightGroups, newGroup];
      setLightGroups(updated);
      try {
        persistActiveFloor({ lightGroups: updated });
      } catch (e) {
        console.error('[Config] Add group save failed:', e);
      }
    },
    [lightGroups],
  );

  const handleRenameGroup = useCallback(
    async (groupId: string, name: string) => {
      const updated = lightGroups.map((g) =>
        g.id === groupId ? { ...g, name } : g,
      );
      setLightGroups(updated);
      try {
        persistActiveFloor({ lightGroups: updated });
      } catch (e) {
        console.error('[Config] Rename group save failed:', e);
      }
    },
    [lightGroups],
  );

  const handleDeleteGroup = useCallback(
    async (groupId: string) => {
      const updatedGroups = lightGroups.filter((g) => g.id !== groupId);
      const updatedLights = lights.map((l) =>
        l.group === groupId ? { ...l, group: undefined } : l,
      );
      setLightGroups(updatedGroups);
      setLights(updatedLights);
      try {
        persistActiveFloor({ lights: updatedLights, lightGroups: updatedGroups });
      } catch (e) {
        console.error('[Config] Delete group save failed:', e);
      }
    },
    [lights, lightGroups],
  );

  // Close panel
  const handleClosePanel = useCallback(() => {
    setPanelOpen(false);
    clearPreview();
    exitPlacingMode();
    setEditIdx(null);
  }, [clearPreview, exitPlacingMode]);
  const handleClosePanelRef = useRef(handleClosePanel);
  handleClosePanelRef.current = handleClosePanel;

  // Save light (and auto-save config to server)
  const handleSaveLight = useCallback(
    async (cfg: LightConfig) => {
      const scene = sceneCtxRef.current?.scene;
      if (!scene) return;

      let updated: LightConfig[];
      if (editIdx !== null) {
        const oldId = lights[editIdx].entityId;
        if (oldId !== cfg.entityId) removeLightMesh(meshMapRef.current, oldId);
        updated = lights.map((l, i) => (i === editIdx ? cfg : l));
      } else {
        updated = [...lights, cfg];
      }

      setLights(updated);
      clearPreview();
      rebuildAllMeshes(scene, meshMapRef.current, updated);
      setPanelOpen(false);
      exitPlacingMode();
      setEditIdx(null);
      document.dispatchEvent(new Event('tour:entity-saved'));

      // Auto-save to server
      try {
        persistActiveFloor({ lights: updated });
        showToast('Light saved & synced to server');
      } catch (e) {
        console.error('[Config] Auto-save failed:', e);
        showToast('Light saved locally (server sync failed)');
      }
    },
    [lights, editIdx, clearPreview, exitPlacingMode, showToast],
  );

  // --- Display handlers ---

  const handleAddDisplay = useCallback(() => {
    setDisplayEditIdx(null);
    setPosition({ x: 0, y: 1.5, z: 0 });
    setDisplayNormal({ x: 0, y: 0, z: 1 });
    posUndoStackRef.current = [];
    setDisplayPanelOpen(true);
  }, []);

  const handleEditDisplay = useCallback(
    (idx: number) => {
      const cfg = displays[idx];
      setDisplayEditIdx(idx);
      setPosition(cfg.position);
      setDisplayNormal(cfg.normal);
      posUndoStackRef.current = [];
      setDisplayPanelOpen(true);
      // Show purple outline around the display being edited
      const entry = displayMeshMapRef.current[cfg.id];
      if (entry) showDisplayOutline(entry.plane);
    },
    [displays, showDisplayOutline],
  );

  const handleEditDisplayRef = useRef(handleEditDisplay);
  handleEditDisplayRef.current = handleEditDisplay;

  const handleDeleteDisplay = useCallback(
    async (idx: number) => {
      const scene = sceneCtxRef.current?.scene;
      if (!scene) return;
      const id = displays[idx].id;
      removeDisplayMesh(displayMeshMapRef.current, id);
      const updated = displays.filter((_, i) => i !== idx);
      setDisplays(updated);

      try {
        persistActiveFloor({ displays: updated });
        showToast('Display deleted & synced to server');
      } catch (e) {
        console.error('[Config] Auto-save failed:', e);
        showToast('Display deleted locally (server sync failed)');
      }
    },
    [displays, showToast],
  );

  const handleDuplicateDisplay = useCallback(
    async (idx: number) => {
      const scene = sceneCtxRef.current?.scene;
      if (!scene) return;
      const src = displays[idx];
      const copy: DisplayConfig = {
        ...src,
        id: generateUUID(),
        label: (src.label || src.id) + ' (copy)',
        position: { ...src.position, x: src.position.x + 0.3 },
        sources: src.sources.map((s) => ({ ...s })),
      };
      const updated = [...displays, copy];
      setDisplays(updated);
      rebuildAllDisplayMeshes(scene, displayMeshMapRef.current, updated);
      for (const entry of Object.values(displayMeshMapRef.current)) {
        entry.plane.isPickable = true;
        updateDisplayTexture(entry, {});
      }

      try {
        persistActiveFloor({ displays: updated });
        showToast('Display duplicated & synced to server');
      } catch (e) {
        console.error('[Config] Auto-save failed:', e);
        showToast('Display duplicated locally (server sync failed)');
      }
    },
    [displays, showToast],
  );

  const handleCloseDisplayPanel = useCallback(() => {
    // Remove preview display mesh
    if (displayPreviewIdRef.current) {
      removeDisplayMesh(displayMeshMapRef.current, displayPreviewIdRef.current);
      displayPreviewIdRef.current = null;
    }
    // Restore original display mesh if we were editing (not adding new)
    const scene = sceneCtxRef.current?.scene;
    if (scene && displayEditIdx !== null) {
      const cfg = displaysRef.current[displayEditIdx];
      if (cfg) {
        const entry = createDisplayMesh(scene, cfg);
        entry.plane.isPickable = true;
        displayMeshMapRef.current[cfg.id] = entry;
        updateDisplayTexture(entry, buildMockupStates(displaysRef.current));
      }
    }
    clearDisplayOutline();
    setDisplayPanelOpen(false);
    clearPreview();
    exitPlacingMode();
    setDisplayEditIdx(null);
  }, [clearPreview, clearDisplayOutline, exitPlacingMode, displayEditIdx]);
  const handleCloseDisplayPanelRef = useRef(handleCloseDisplayPanel);
  handleCloseDisplayPanelRef.current = handleCloseDisplayPanel;

  // Live preview: rebuild display mesh on every form change
  const handleDisplayPreviewChange = useCallback(
    (info: DisplayPreviewInfo) => {
      const scene = sceneCtxRef.current?.scene;
      if (!scene) return;

      // Determine which display ID we're previewing
      const editIdx = displayEditIdx;
      const editingCfg = displaysRef.current[editIdx ?? -1];
      const previewId = editingCfg?.id || '__preview__';

      // Remove old preview mesh (or the original display being edited on first call)
      const oldPreviewId = displayPreviewIdRef.current;
      if (oldPreviewId) {
        removeDisplayMesh(displayMeshMapRef.current, oldPreviewId);
      } else if (previewId !== '__preview__') {
        // First preview change while editing — dispose the original display mesh
        removeDisplayMesh(displayMeshMapRef.current, previewId);
      }
      displayPreviewIdRef.current = previewId;

      // Build a temporary DisplayConfig from form state
      const tempCfg: DisplayConfig = {
        id: previewId,
        label: '',
        sources: info.sources,
        position: positionRef.current,
        normal: displayNormalRef.current,
        width: 0,
        height: 0,
        textAlign: info.textAlign,
        opacity: info.opacity,
        backgroundColor: info.backgroundColor,
        mirrorH: info.mirrorH,
        mirrorV: info.mirrorV,
      };

      const entry = createDisplayMesh(scene, tempCfg);
      entry.plane.isPickable = false;
      displayMeshMapRef.current[previewId] = entry;
      updateDisplayTexture(entry, buildMockupStates([tempCfg]));

      // Show purple outline around the preview display
      showDisplayOutline(entry.plane);

      // Attach position gizmo to display plane
      if (gizmoRef.current) {
        gizmoRef.current.dispose();
        gizmoRef.current = null;
      }
      if (!utilLayerRef.current) {
        utilLayerRef.current = new UtilityLayerRenderer(scene);
      }
      const gizmo = new PositionGizmo(utilLayerRef.current);
      gizmo.scaleRatio = 1.2;
      gizmo.updateGizmoRotationToMatchAttachedMesh = false;
      gizmo.attachedMesh = entry.plane;

      const onDragStart = () => {
        draggingGizmoRef.current = true;
        posUndoStackRef.current.push({ ...positionRef.current });
      };
      const onDrag = () => {
        const p = entry.plane.position;
        const n = displayNormalRef.current;
        const len = Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z) || 1;
        const newPos: LightPosition = {
          x: parseFloat((p.x - (n.x / len) * 0.005).toFixed(3)),
          y: parseFloat((p.y - (n.y / len) * 0.005).toFixed(3)),
          z: parseFloat((p.z - (n.z / len) * 0.005).toFixed(3)),
        };
        positionRef.current = newPos;
        setPosition(newPos);
      };
      const onDragEnd = () => { draggingGizmoRef.current = false; document.dispatchEvent(new Event('tour:gizmo-used')); };
      for (const ax of [gizmo.xGizmo, gizmo.yGizmo, gizmo.zGizmo]) {
        ax.dragBehavior.onDragStartObservable.add(onDragStart);
        ax.dragBehavior.onDragObservable.add(onDrag);
        ax.dragBehavior.onDragEndObservable.add(onDragEnd);
      }
      for (const m of utilLayerRef.current!.utilityLayerScene.meshes) {
        if (m.material) {
          (m.material as StandardMaterial).alpha = 0.5;
        }
      }
      gizmoRef.current = gizmo;
    },
    [displayEditIdx, showDisplayOutline],
  );

  const handleSaveDisplay = useCallback(
    async (cfg: DisplayConfig) => {
      const scene = sceneCtxRef.current?.scene;
      if (!scene) return;

      // Clean up preview mesh
      if (displayPreviewIdRef.current) {
        removeDisplayMesh(displayMeshMapRef.current, displayPreviewIdRef.current);
        displayPreviewIdRef.current = null;
      }

      let updated: DisplayConfig[];
      if (displayEditIdx !== null) {
        const oldId = displays[displayEditIdx].id;
        if (oldId !== cfg.id) removeDisplayMesh(displayMeshMapRef.current, oldId);
        updated = displays.map((d, i) => (i === displayEditIdx ? cfg : d));
      } else {
        updated = [...displays, cfg];
      }

      setDisplays(updated);
      clearPreview();
      rebuildAllDisplayMeshes(scene, displayMeshMapRef.current, updated);
      for (const entry of Object.values(displayMeshMapRef.current)) {
        entry.plane.isPickable = true;
        updateDisplayTexture(entry, buildMockupStates(updated));
      }
      setDisplayPanelOpen(false);
      exitPlacingMode();
      setDisplayEditIdx(null);

      try {
        persistActiveFloor({ displays: updated });
        showToast('Display saved & synced to server');
      } catch (e) {
        console.error('[Config] Auto-save failed:', e);
        showToast('Display saved locally (server sync failed)');
      }
    },
    [displays, displayEditIdx, clearPreview, exitPlacingMode, showToast],
  );

  // --- Cover (roller shutter) handlers ---

  const handleAddCover = useCallback(() => {
    setCoverEditIdx(null);
    setPosition({ x: 0, y: 1.5, z: 0 });
    setCoverNormal({ x: 0, y: 0, z: 1 });
    posUndoStackRef.current = [];
    setCoverPanelOpen(true);
  }, []);

  const handleEditCover = useCallback(
    (idx: number) => {
      const cfg = covers[idx];
      setCoverEditIdx(idx);
      setPosition(cfg.position);
      setCoverNormal(cfg.normal);
      posUndoStackRef.current = [];
      setCoverPanelOpen(true);
    },
    [covers],
  );

  const handleEditCoverRef = useRef(handleEditCover);
  handleEditCoverRef.current = handleEditCover;

  const handleDeleteCover = useCallback(
    async (idx: number) => {
      const scene = sceneCtxRef.current?.scene;
      if (!scene) return;
      removeCoverMesh(scene, coverMeshMapRef.current, covers[idx].entityId);
      const updated = covers.filter((_, i) => i !== idx);
      setCovers(updated);
      try {
        persistActiveFloor({ covers: updated });
        showToast('Cover deleted & synced to server');
      } catch (e) {
        console.error('[Config] Auto-save failed:', e);
        showToast('Cover deleted locally (server sync failed)');
      }
    },
    [covers, showToast],
  );

  const handleDuplicateCover = useCallback(
    async (idx: number) => {
      const scene = sceneCtxRef.current?.scene;
      if (!scene) return;
      const src = covers[idx];
      // Shift the copy along the wall (perpendicular to the outward normal)
      const tangent = { x: -src.normal.z, z: src.normal.x };
      const copy: CoverConfig = {
        ...src,
        entityId: src.entityId + '_copy',
        label: (src.label || src.entityId) + ' (copy)',
        position: {
          x: parseFloat((src.position.x + tangent.x * (src.width + 0.1)).toFixed(3)),
          y: src.position.y,
          z: parseFloat((src.position.z + tangent.z * (src.width + 0.1)).toFixed(3)),
        },
      };
      const updated = [...covers, copy];
      setCovers(updated);
      rebuildAllCoverMeshes(scene, coverMeshMapRef.current, updated, EDITOR_COVER_POSITION);
      try {
        persistActiveFloor({ covers: updated });
        showToast('Cover duplicated & synced to server');
      } catch (e) {
        console.error('[Config] Auto-save failed:', e);
        showToast('Cover duplicated locally (server sync failed)');
      }
    },
    [covers, showToast],
  );

  const handleCloseCoverPanel = useCallback(() => {
    const scene = sceneCtxRef.current?.scene;
    // Remove preview cover mesh
    if (coverPreviewIdRef.current && scene) {
      removeCoverMesh(scene, coverMeshMapRef.current, coverPreviewIdRef.current);
      coverPreviewIdRef.current = null;
    }
    // Restore original cover mesh if we were editing (not adding new)
    if (scene && coverEditIdx !== null) {
      const cfg = coversRef.current[coverEditIdx];
      if (cfg) {
        const entry = createCoverMesh(scene, cfg, cfg.entityId);
        setCoverPosition(scene, entry, EDITOR_COVER_POSITION, false);
        coverMeshMapRef.current[cfg.entityId] = entry;
      }
    }
    setCoverPanelOpen(false);
    clearPreview();
    exitPlacingMode();
    setCoverEditIdx(null);
  }, [clearPreview, exitPlacingMode, coverEditIdx]);
  const handleCloseCoverPanelRef = useRef(handleCloseCoverPanel);
  handleCloseCoverPanelRef.current = handleCloseCoverPanel;

  // Rebuild the live preview cover mesh from current form state + position/normal
  const rebuildCoverPreview = useCallback(() => {
    const scene = sceneCtxRef.current?.scene;
    if (!scene) return;

    const editingCfg = coversRef.current[coverEditIdx ?? -1];
    const previewId = editingCfg?.entityId || '__cover_preview__';

    // Remove old preview mesh (or the original cover being edited on first call)
    const oldPreviewId = coverPreviewIdRef.current;
    if (oldPreviewId) {
      removeCoverMesh(scene, coverMeshMapRef.current, oldPreviewId);
    } else if (previewId !== '__cover_preview__') {
      removeCoverMesh(scene, coverMeshMapRef.current, previewId);
    }
    coverPreviewIdRef.current = previewId;

    const info = coverPreviewInfoRef.current;
    const tempCfg: CoverConfig = {
      entityId: previewId,
      label: '',
      position: positionRef.current,
      normal: coverNormalRef.current,
      width: info.width,
      height: info.height,
    };
    const entry = createCoverMesh(scene, tempCfg, '__preview__');
    setCoverPosition(scene, entry, EDITOR_COVER_POSITION, false);
    // Tag as preview so placing-mode picks and click-to-edit ignore it
    entry.housing.metadata = { previewTarget: 'cover' };
    entry.panel.metadata = { previewTarget: 'cover' };
    entry.hitbox.metadata = { previewTarget: 'cover' };
    // Show the hitbox as a magenta wireframe (shared material, reused across rebuilds)
    let hbMat = scene.getMaterialByName('cover-preview-hitbox-mat') as StandardMaterial | null;
    if (!hbMat) {
      hbMat = new StandardMaterial('cover-preview-hitbox-mat', scene);
      hbMat.emissiveColor = new Color3(1, 0.2, 0.8);
      hbMat.alpha = 0.3;
      hbMat.wireframe = true;
      hbMat.disableLighting = true;
    }
    entry.hitbox.material = hbMat;
    entry.hitbox.visibility = 1;
    coverMeshMapRef.current[previewId] = entry;

    // Attach position gizmo to the hitbox (delta-based drag)
    if (gizmoRef.current) {
      gizmoRef.current.dispose();
      gizmoRef.current = null;
    }
    if (!utilLayerRef.current) {
      utilLayerRef.current = new UtilityLayerRenderer(scene);
    }
    const gizmo = new PositionGizmo(utilLayerRef.current);
    gizmo.scaleRatio = 1.2;
    gizmo.updateGizmoRotationToMatchAttachedMesh = false;
    gizmo.attachedMesh = entry.hitbox;

    let dragStartPos = { ...positionRef.current };
    let hitboxStart = entry.hitbox.position.clone();
    const onDragStart = () => {
      draggingGizmoRef.current = true;
      posUndoStackRef.current.push({ ...positionRef.current });
      dragStartPos = { ...positionRef.current };
      hitboxStart = entry.hitbox.position.clone();
    };
    const onDrag = () => {
      const d = entry.hitbox.position.subtract(hitboxStart);
      const newPos: LightPosition = {
        x: parseFloat((dragStartPos.x + d.x).toFixed(3)),
        y: parseFloat((dragStartPos.y + d.y).toFixed(3)),
        z: parseFloat((dragStartPos.z + d.z).toFixed(3)),
      };
      positionRef.current = newPos;
      setPosition(newPos);
    };
    const onDragEnd = () => {
      draggingGizmoRef.current = false;
      document.dispatchEvent(new Event('tour:gizmo-used'));
      // Force a preview rebuild at the final position (housing/panel follow the hitbox)
      setPosition({ ...positionRef.current });
    };
    for (const ax of [gizmo.xGizmo, gizmo.yGizmo, gizmo.zGizmo]) {
      ax.dragBehavior.onDragStartObservable.add(onDragStart);
      ax.dragBehavior.onDragObservable.add(onDrag);
      ax.dragBehavior.onDragEndObservable.add(onDragEnd);
    }
    for (const m of utilLayerRef.current!.utilityLayerScene.meshes) {
      if (m.material) {
        (m.material as StandardMaterial).alpha = 0.5;
      }
    }
    gizmoRef.current = gizmo;
  }, [coverEditIdx]);

  const handleCoverPreviewChange = useCallback(
    (info: CoverPreviewInfo) => {
      coverPreviewInfoRef.current = info;
      if (coverPanelOpenRef.current) rebuildCoverPreview();
    },
    [rebuildCoverPreview],
  );

  const handleSaveCover = useCallback(
    async (cfg: CoverConfig) => {
      const scene = sceneCtxRef.current?.scene;
      if (!scene) return;

      // Clean up preview mesh
      if (coverPreviewIdRef.current) {
        removeCoverMesh(scene, coverMeshMapRef.current, coverPreviewIdRef.current);
        coverPreviewIdRef.current = null;
      }

      let updated: CoverConfig[];
      if (coverEditIdx !== null) {
        updated = covers.map((c, i) => (i === coverEditIdx ? cfg : c));
      } else {
        updated = [...covers, cfg];
      }

      setCovers(updated);
      clearPreview();
      rebuildAllCoverMeshes(scene, coverMeshMapRef.current, updated, EDITOR_COVER_POSITION);
      setCoverPanelOpen(false);
      exitPlacingMode();
      setCoverEditIdx(null);

      try {
        persistActiveFloor({ covers: updated });
        showToast('Cover saved & synced to server');
      } catch (e) {
        console.error('[Config] Auto-save failed:', e);
        showToast('Cover saved locally (server sync failed)');
      }
    },
    [covers, coverEditIdx, clearPreview, exitPlacingMode, showToast],
  );

  // Rebuild cover preview when position/normal changes (skip during gizmo drag)
  useEffect(() => {
    if (!coverPanelOpen) return;
    if (draggingGizmoRef.current) return; // hitbox moves via gizmo; rebuild happens on drag end
    rebuildCoverPreview();
  }, [position, coverNormal, coverPanelOpen, rebuildCoverPreview]);

  // --- Staircase handlers ---

  const handleAddStaircase = useCallback(() => {
    setStaircaseEditIdx(null);
    setPosition({ x: 0, y: 0, z: 0 });
    staircasePreviewInfoRef.current = { style: 'up', rotationY: 0 };
    posUndoStackRef.current = [];
    setStaircasePanelOpen(true);
  }, []);

  const handleEditStaircase = useCallback(
    (idx: number) => {
      const cfg = staircases[idx];
      setStaircaseEditIdx(idx);
      setPosition(cfg.position);
      staircasePreviewInfoRef.current = { style: cfg.style, rotationY: cfg.rotationY ?? 0 };
      posUndoStackRef.current = [];
      setStaircasePanelOpen(true);
    },
    [staircases],
  );
  const handleEditStaircaseRef = useRef(handleEditStaircase);
  handleEditStaircaseRef.current = handleEditStaircase;

  const handleDeleteStaircase = useCallback(
    (idx: number) => {
      const scene = sceneCtxRef.current?.scene;
      if (!scene) return;
      removeStaircaseMesh(scene, staircaseMeshMapRef.current, staircases[idx].id);
      const updated = staircases.filter((_, i) => i !== idx);
      setStaircases(updated);
      staircasesRef.current = updated;
      persistActiveFloor({ staircases: updated });
      showToast('Staircase deleted');
    },
    [staircases, persistActiveFloor, showToast],
  );

  const handleDuplicateStaircase = useCallback(
    (idx: number) => {
      const scene = sceneCtxRef.current?.scene;
      if (!scene) return;
      const src = staircases[idx];
      const copy: StaircaseConfig = {
        ...src,
        id: generateUUID(),
        position: { ...src.position, x: parseFloat((src.position.x + 0.6).toFixed(3)) },
      };
      const updated = [...staircases, copy];
      setStaircases(updated);
      staircasesRef.current = updated;
      rebuildAllStaircaseMeshes(scene, staircaseMeshMapRef.current, updated);
      persistActiveFloor({ staircases: updated });
      showToast('Staircase duplicated');
    },
    [staircases, persistActiveFloor, showToast],
  );

  const handleCloseStaircasePanel = useCallback(() => {
    const scene = sceneCtxRef.current?.scene;
    if (staircasePreviewIdRef.current && scene) {
      removeStaircaseMesh(scene, staircaseMeshMapRef.current, staircasePreviewIdRef.current);
      staircasePreviewIdRef.current = null;
    }
    // Restore the original staircase mesh if we were editing
    if (scene && staircaseEditIdx !== null) {
      const cfg = staircasesRef.current[staircaseEditIdx];
      if (cfg) staircaseMeshMapRef.current[cfg.id] = createStaircaseMesh(scene, cfg);
    }
    setStaircasePanelOpen(false);
    clearPreview();
    exitPlacingMode();
    setStaircaseEditIdx(null);
  }, [clearPreview, exitPlacingMode, staircaseEditIdx]);
  const handleCloseStaircasePanelRef = useRef(handleCloseStaircasePanel);
  handleCloseStaircasePanelRef.current = handleCloseStaircasePanel;

  // Live preview staircase mesh + move gizmo attached to its root node
  const rebuildStaircasePreview = useCallback(() => {
    const scene = sceneCtxRef.current?.scene;
    if (!scene) return;

    const editingCfg = staircasesRef.current[staircaseEditIdx ?? -1];
    const previewId = editingCfg?.id || '__stair_preview__';
    const oldPreviewId = staircasePreviewIdRef.current;
    if (oldPreviewId) {
      removeStaircaseMesh(scene, staircaseMeshMapRef.current, oldPreviewId);
    } else if (previewId !== '__stair_preview__') {
      removeStaircaseMesh(scene, staircaseMeshMapRef.current, previewId);
    }
    staircasePreviewIdRef.current = previewId;

    const info = staircasePreviewInfoRef.current;
    const tempCfg: StaircaseConfig = {
      id: previewId,
      style: info.style,
      targetFloorId: '',
      position: positionRef.current,
      rotationY: info.rotationY,
    };
    const entry = createStaircaseMesh(scene, tempCfg);
    entry.hitbox.metadata = { previewTarget: 'stair' };
    entry.steps.metadata = { previewTarget: 'stair' };
    staircaseMeshMapRef.current[previewId] = entry;

    if (gizmoRef.current) {
      gizmoRef.current.dispose();
      gizmoRef.current = null;
    }
    if (!utilLayerRef.current) {
      utilLayerRef.current = new UtilityLayerRenderer(scene);
    }
    const gizmo = new PositionGizmo(utilLayerRef.current);
    gizmo.scaleRatio = 1.2;
    gizmo.updateGizmoRotationToMatchAttachedMesh = false;
    // The root node's position IS the staircase world position (no parent).
    gizmo.attachedNode = entry.root;

    const onDragStart = () => {
      draggingGizmoRef.current = true;
      posUndoStackRef.current.push({ ...positionRef.current });
    };
    const onDrag = () => {
      const p = entry.root.position;
      const newPos: LightPosition = {
        x: parseFloat(p.x.toFixed(3)),
        y: parseFloat(p.y.toFixed(3)),
        z: parseFloat(p.z.toFixed(3)),
      };
      positionRef.current = newPos;
      setPosition(newPos);
    };
    const onDragEnd = () => {
      draggingGizmoRef.current = false;
      document.dispatchEvent(new Event('tour:gizmo-used'));
      setPosition({ ...positionRef.current });
    };
    for (const ax of [gizmo.xGizmo, gizmo.yGizmo, gizmo.zGizmo]) {
      ax.dragBehavior.onDragStartObservable.add(onDragStart);
      ax.dragBehavior.onDragObservable.add(onDrag);
      ax.dragBehavior.onDragEndObservable.add(onDragEnd);
    }
    for (const m of utilLayerRef.current!.utilityLayerScene.meshes) {
      if (m.material) {
        (m.material as StandardMaterial).alpha = 0.5;
      }
    }
    gizmoRef.current = gizmo;
  }, [staircaseEditIdx]);

  const handleStaircasePreviewChange = useCallback(
    (info: StaircasePreviewInfo) => {
      staircasePreviewInfoRef.current = info;
      if (staircasePanelOpenRef.current) rebuildStaircasePreview();
    },
    [rebuildStaircasePreview],
  );

  const handleSaveStaircase = useCallback(
    (cfg: StaircaseConfig) => {
      const scene = sceneCtxRef.current?.scene;
      if (!scene) return;
      if (staircasePreviewIdRef.current) {
        removeStaircaseMesh(scene, staircaseMeshMapRef.current, staircasePreviewIdRef.current);
        staircasePreviewIdRef.current = null;
      }
      let updated: StaircaseConfig[];
      if (staircaseEditIdx !== null) {
        updated = staircases.map((s, i) => (i === staircaseEditIdx ? cfg : s));
      } else {
        updated = [...staircases, cfg];
      }
      setStaircases(updated);
      staircasesRef.current = updated;
      clearPreview();
      rebuildAllStaircaseMeshes(scene, staircaseMeshMapRef.current, updated);
      setStaircasePanelOpen(false);
      exitPlacingMode();
      setStaircaseEditIdx(null);
      persistActiveFloor({ staircases: updated });
      showToast('Staircase saved');
    },
    [staircases, staircaseEditIdx, clearPreview, exitPlacingMode, persistActiveFloor, showToast],
  );

  // Rebuild staircase preview when position changes (skip during gizmo drag)
  useEffect(() => {
    if (!staircasePanelOpen) return;
    if (draggingGizmoRef.current) return;
    rebuildStaircasePreview();
  }, [position, staircasePanelOpen, rebuildStaircasePreview]);

  // --- Camera handlers ---

  const handleAddCamera = useCallback(() => {
    setCameraEditIdx(null);
    setPosition({ x: 0, y: 2.6, z: 0 });
    setCameraOrient({ rotationY: 0, tilt: 0 });
    cameraOrientRef.current = { rotationY: 0, tilt: 0 };
    posUndoStackRef.current = [];
    setCameraPanelOpen(true);
  }, []);

  const handleEditCamera = useCallback(
    (idx: number) => {
      const cfg = cameras[idx];
      const orient = { rotationY: cfg.rotationY ?? 0, tilt: cfg.tilt ?? 0 };
      setCameraEditIdx(idx);
      setPosition(cfg.position);
      setCameraOrient(orient);
      cameraOrientRef.current = orient;
      posUndoStackRef.current = [];
      setCameraPanelOpen(true);
    },
    [cameras],
  );
  const handleEditCameraRef = useRef(handleEditCamera);
  handleEditCameraRef.current = handleEditCamera;

  const handleDeleteCamera = useCallback(
    (idx: number) => {
      const scene = sceneCtxRef.current?.scene;
      if (!scene) return;
      removeCameraMesh(scene, cameraMeshMapRef.current, cameras[idx].id);
      const updated = cameras.filter((_, i) => i !== idx);
      setCameras(updated);
      camerasRef.current = updated;
      persistActiveFloor({ cameras: updated });
      showToast('Camera deleted');
    },
    [cameras, persistActiveFloor, showToast],
  );

  const handleDuplicateCamera = useCallback(
    (idx: number) => {
      const scene = sceneCtxRef.current?.scene;
      if (!scene) return;
      const src = cameras[idx];
      const copy: CameraConfig = {
        ...src,
        id: generateUUID(),
        entityId: src.entityId,
        label: (src.label || src.entityId) + ' (copy)',
        position: { ...src.position, x: parseFloat((src.position.x + 0.5).toFixed(3)) },
      };
      const updated = [...cameras, copy];
      setCameras(updated);
      camerasRef.current = updated;
      rebuildAllCameraMeshes(scene, cameraMeshMapRef.current, updated);
      persistActiveFloor({ cameras: updated });
      showToast('Camera duplicated');
    },
    [cameras, persistActiveFloor, showToast],
  );

  const handleCloseCameraPanel = useCallback(() => {
    const scene = sceneCtxRef.current?.scene;
    if (cameraPreviewIdRef.current && scene) {
      removeCameraMesh(scene, cameraMeshMapRef.current, cameraPreviewIdRef.current);
      cameraPreviewIdRef.current = null;
    }
    if (scene && cameraEditIdx !== null) {
      const cfg = camerasRef.current[cameraEditIdx];
      if (cfg) cameraMeshMapRef.current[cfg.id] = createCameraMesh(scene, cfg);
    }
    setCameraPanelOpen(false);
    clearPreview();
    exitPlacingMode();
    setCameraEditIdx(null);
  }, [clearPreview, exitPlacingMode, cameraEditIdx]);
  const handleCloseCameraPanelRef = useRef(handleCloseCameraPanel);
  handleCloseCameraPanelRef.current = handleCloseCameraPanel;

  // Live preview camera mesh + move gizmo on its root node
  const rebuildCameraPreview = useCallback(() => {
    const scene = sceneCtxRef.current?.scene;
    if (!scene) return;

    const editingCfg = camerasRef.current[cameraEditIdx ?? -1];
    const previewId = editingCfg?.id || '__cam_preview__';
    const oldPreviewId = cameraPreviewIdRef.current;
    if (oldPreviewId) {
      removeCameraMesh(scene, cameraMeshMapRef.current, oldPreviewId);
    } else if (previewId !== '__cam_preview__') {
      removeCameraMesh(scene, cameraMeshMapRef.current, previewId);
    }
    cameraPreviewIdRef.current = previewId;

    const orient = cameraOrientRef.current;
    const tempCfg: CameraConfig = {
      id: previewId,
      entityId: '',
      label: '',
      position: positionRef.current,
      rotationY: orient.rotationY,
      tilt: orient.tilt,
    };
    const entry = createCameraMesh(scene, tempCfg);
    entry.hitbox.metadata = { previewTarget: 'camera' };
    cameraMeshMapRef.current[previewId] = entry;

    if (gizmoRef.current) {
      gizmoRef.current.dispose();
      gizmoRef.current = null;
    }
    if (!utilLayerRef.current) {
      utilLayerRef.current = new UtilityLayerRenderer(scene);
    }
    const gizmo = new PositionGizmo(utilLayerRef.current);
    gizmo.scaleRatio = 1.2;
    gizmo.updateGizmoRotationToMatchAttachedMesh = false;
    gizmo.attachedNode = entry.root;

    const onDragStart = () => {
      draggingGizmoRef.current = true;
      posUndoStackRef.current.push({ ...positionRef.current });
    };
    const onDrag = () => {
      const p = entry.root.position;
      const newPos: LightPosition = {
        x: parseFloat(p.x.toFixed(3)),
        y: parseFloat(p.y.toFixed(3)),
        z: parseFloat(p.z.toFixed(3)),
      };
      positionRef.current = newPos;
      setPosition(newPos);
    };
    const onDragEnd = () => {
      draggingGizmoRef.current = false;
      document.dispatchEvent(new Event('tour:gizmo-used'));
      setPosition({ ...positionRef.current });
    };
    for (const ax of [gizmo.xGizmo, gizmo.yGizmo, gizmo.zGizmo]) {
      ax.dragBehavior.onDragStartObservable.add(onDragStart);
      ax.dragBehavior.onDragObservable.add(onDrag);
      ax.dragBehavior.onDragEndObservable.add(onDragEnd);
    }
    for (const m of utilLayerRef.current!.utilityLayerScene.meshes) {
      if (m.material) {
        (m.material as StandardMaterial).alpha = 0.5;
      }
    }
    gizmoRef.current = gizmo;
  }, [cameraEditIdx]);

  const handleSaveCamera = useCallback(
    (cfg: CameraConfig) => {
      const scene = sceneCtxRef.current?.scene;
      if (!scene) return;
      if (cameraPreviewIdRef.current) {
        removeCameraMesh(scene, cameraMeshMapRef.current, cameraPreviewIdRef.current);
        cameraPreviewIdRef.current = null;
      }
      let updated: CameraConfig[];
      if (cameraEditIdx !== null) {
        updated = cameras.map((c, i) => (i === cameraEditIdx ? cfg : c));
      } else {
        updated = [...cameras, cfg];
      }
      setCameras(updated);
      camerasRef.current = updated;
      clearPreview();
      rebuildAllCameraMeshes(scene, cameraMeshMapRef.current, updated);
      setCameraPanelOpen(false);
      exitPlacingMode();
      setCameraEditIdx(null);
      persistActiveFloor({ cameras: updated });
      showToast('Camera saved');
    },
    [cameras, cameraEditIdx, clearPreview, exitPlacingMode, persistActiveFloor, showToast],
  );

  // Rebuild camera preview when position or orientation changes (skip during gizmo drag)
  useEffect(() => {
    if (!cameraPanelOpen) return;
    if (draggingGizmoRef.current) return;
    rebuildCameraPreview();
  }, [position, cameraOrient, cameraPanelOpen, rebuildCameraPreview]);

  // --- Floor management handlers ---

  const handleAddFloor = useCallback(() => {
    const config = configRef.current;
    if (!config) return;
    const current = getFloors(config);
    const nf = createEmptyFloor(`Floor ${current.length + 1}`, current.length);
    const updated = [...current, nf];
    configRef.current = { ...config, floors: updated };
    setFloors(updated);
    try { updateConfig({ floors: updated }); } catch (e) {
      console.warn('[Config] Add floor failed:', e);
    }
    switchEditFloor(nf.id);
    showToast(`Added "${nf.name}" — upload its model`);
  }, [switchEditFloor, showToast]);

  const handleRenameFloor = useCallback(() => {
    const config = configRef.current;
    if (!config) return;
    const cur = getFloors(config).find((f) => f.id === editFloorIdRef.current);
    const name = window.prompt('Floor name', cur?.name ?? '');
    if (!name) return;
    persistActiveFloor({ name });
  }, [persistActiveFloor]);

  const handleDeleteFloor = useCallback(() => {
    const config = configRef.current;
    if (!config) return;
    const cur = getFloors(config);
    if (cur.length <= 1) {
      showToast('Cannot delete the only floor');
      return;
    }
    const victim = cur.find((f) => f.id === editFloorIdRef.current);
    if (!victim) return;
    if (!window.confirm(`Delete floor "${victim.name}" and its model?`)) return;
    // Drop the floor, delete its model, and unlink staircases that targeted it
    const remaining = cur
      .filter((f) => f.id !== victim.id)
      .map((f) => ({
        ...f,
        staircases: (f.staircases ?? []).filter((s) => s.targetFloorId !== victim.id),
      }));
    configRef.current = { ...config, floors: remaining };
    setFloors(remaining);
    try { updateConfig({ floors: remaining }); } catch (e) {
      console.warn('[Config] Delete floor failed:', e);
    }
    deleteModelBlob(victim.modelId).catch(() => {});
    switchEditFloor(remaining[0].id);
    showToast(`Deleted "${victim.name}"`);
  }, [switchEditFloor, showToast]);

  const handleUploadFloorModel = useCallback(
    async (file: File) => {
      const config = configRef.current;
      if (!config) return;
      const floor = getFloors(config).find((f) => f.id === editFloorIdRef.current);
      if (!floor) return;
      try {
        await uploadModel(file, floor.modelId);
        await loadFloorIntoEditor(floor);
        showToast(`Model uploaded for "${floor.name}"`);
      } catch (e) {
        alert('Upload failed: ' + (e instanceof Error ? e.message : e));
      }
    },
    [loadFloorIntoEditor, showToast],
  );

  // --- Shadow wall handlers ---

  const handleAddWall = useCallback(() => {
    setWallEditIdx(null);
    setPosition({ x: 0, y: 2.6, z: 0 });
    posUndoStackRef.current = [];
    setWallPanelOpen(true);
  }, []);

  const handleEditWall = useCallback(
    (idx: number) => {
      const cfg = shadowWalls[idx];
      setWallEditIdx(idx);
      setPosition(cfg.position);
      posUndoStackRef.current = [];
      setWallPanelOpen(true);
    },
    [shadowWalls],
  );

  const handleDeleteWall = useCallback(
    async (idx: number) => {
      const updated = shadowWalls.filter((_, i) => i !== idx);
      setShadowWalls(updated);
      try {
        persistActiveFloor({ shadowWalls: updated });
        showToast('Wall deleted & synced to server');
      } catch (e) {
        console.error('[Config] Auto-save failed:', e);
        showToast('Wall deleted locally (server sync failed)');
      }
    },
    [shadowWalls, showToast],
  );

  const handleDuplicateWall = useCallback(
    async (idx: number) => {
      const src = shadowWalls[idx];
      const copy: ShadowWallConfig = {
        ...src,
        id: generateUUID(),
        label: (src.label || 'Wall') + ' (copy)',
        position: { ...src.position, x: src.position.x + 0.5 },
        size: { ...src.size },
      };
      const updated = [...shadowWalls, copy];
      setShadowWalls(updated);
      try {
        persistActiveFloor({ shadowWalls: updated });
        showToast('Wall duplicated & synced to server');
      } catch (e) {
        console.error('[Config] Auto-save failed:', e);
        showToast('Wall duplicated locally (server sync failed)');
      }
    },
    [shadowWalls, showToast],
  );

  const handleCloseWallPanel = useCallback(() => {
    setWallPanelOpen(false);
    clearPreview();
    exitPlacingMode();
    setWallEditIdx(null);
  }, [clearPreview, exitPlacingMode]);
  const handleCloseWallPanelRef = useRef(handleCloseWallPanel);
  handleCloseWallPanelRef.current = handleCloseWallPanel;

  const handleWallPreviewChange = useCallback(
    (info: WallPreviewInfo) => {
      wallPreviewInfoRef.current = info;
      if (wallPanelOpen) {
        // Rebuild the wall preview mesh (reuse updatePreviewMesh with cube shape)
        updatePreviewMesh(
          position,
          'cube',
          { width: info.size.width, height: info.size.height, depth: info.size.depth },
        );
      }
    },
    [wallPanelOpen, position, updatePreviewMesh],
  );

  const handleSaveWall = useCallback(
    async (cfg: ShadowWallConfig) => {
      let updated: ShadowWallConfig[];
      if (wallEditIdx !== null) {
        updated = shadowWalls.map((w, i) => (i === wallEditIdx ? cfg : w));
      } else {
        updated = [...shadowWalls, cfg];
      }
      setShadowWalls(updated);
      clearPreview();
      exitPlacingMode();
      setWallPanelOpen(false);
      setWallEditIdx(null);

      try {
        persistActiveFloor({ shadowWalls: updated });
        showToast('Wall saved & synced to server');
      } catch (e) {
        console.error('[Config] Auto-save failed:', e);
        showToast('Wall saved locally (server sync failed)');
      }
    },
    [shadowWalls, wallEditIdx, clearPreview, exitPlacingMode, showToast],
  );

  // Update wall preview mesh when position changes and wall panel is open
  useEffect(() => {
    if (!wallPanelOpen) return;
    if (draggingGizmoRef.current && previewMeshRef.current) {
      previewMeshRef.current.position.set(position.x, position.y, position.z);
      return;
    }
    const info = wallPreviewInfoRef.current;
    updatePreviewMesh(
      position,
      'cube',
      { width: info.size.width, height: info.size.height, depth: info.size.depth },
    );
  }, [position, wallPanelOpen, updatePreviewMesh]);

  // ── Tube handlers ──────────────────────────────────────────────

  const handleAddTube = useCallback(() => {
    setTubeEditIdx(null);
    setPosition({ x: 0, y: 0, z: 0 });
    posUndoStackRef.current = [];
    setTubePanelOpen(true);
  }, []);

  const handleEditTube = useCallback(
    (idx: number) => {
      const cfg = tubes[idx];
      setTubeEditIdx(idx);
      setPosition({ x: cfg.endX, y: 0, z: cfg.endZ });
      posUndoStackRef.current = [];
      setTubePanelOpen(true);
    },
    [tubes],
  );

  const handleEditTubeRef = useRef(handleEditTube);
  handleEditTubeRef.current = handleEditTube;

  const handleDeleteTube = useCallback(
    async (idx: number) => {
      const deleted = tubes[idx];
      if (deleted) removeTubeMeshes(tubeMeshMapRef.current, deleted.id);
      const updated = tubes.filter((_, i) => i !== idx);
      setTubes(updated);
      try {
        persistActiveFloor({ tubes: updated });
        showToast('Tube deleted & synced to server');
      } catch (e) {
        console.error('[Config] Auto-save failed:', e);
        showToast('Tube deleted locally (server sync failed)');
      }
    },
    [tubes, showToast],
  );

  const handleDuplicateTube = useCallback(
    async (idx: number) => {
      const src = tubes[idx];
      const copy: TubeConfig = {
        ...src,
        id: generateUUID(),
        label: (src.label || 'Tube') + ' (copy)',
        endX: src.endX + 0.5,
        lines: src.lines.map(l => ({ ...l })),
      };
      const updated = [...tubes, copy];
      setTubes(updated);
      // Create mesh for the copy
      const scene = sceneCtxRef.current?.scene;
      if (scene) {
        tubeMeshMapRef.current[copy.id] = createTubeMeshes(scene, copy, null);
      }
      try {
        persistActiveFloor({ tubes: updated });
        showToast('Tube duplicated & synced to server');
      } catch (e) {
        console.error('[Config] Auto-save failed:', e);
        showToast('Tube duplicated locally (server sync failed)');
      }
    },
    [tubes, showToast],
  );

  const handleCloseTubePanel = useCallback(() => {
    setTubePanelOpen(false);
    clearPreview();
    setTubeEditIdx(null);
    // Show tube meshes that were hidden during editing
    rebuildTubeEditorMeshes(tubesRef.current);
  }, [clearPreview]);
  const handleCloseTubePanelRef = useRef(handleCloseTubePanel);
  handleCloseTubePanelRef.current = handleCloseTubePanel;

  const rebuildTubeEditorMeshes = useCallback((tubeConfigs: TubeConfig[]) => {
    const scene = sceneCtxRef.current?.scene;
    if (!scene) return;
    disposeAllTubes(tubeMeshMapRef.current);
    for (const tc of tubeConfigs) {
      tubeMeshMapRef.current[tc.id] = createTubeMeshes(scene, tc, null);
    }
    renderMockupLabels(tubeMeshMapRef.current);
  }, []);

  const handleTubePreviewChange = useCallback(
    (info: TubePreviewInfo) => {
      tubePreviewInfoRef.current = info;
      if (!tubePanelOpen) return;
      const scene = sceneCtxRef.current?.scene;
      if (!scene) return;

      // Remove old preview tube
      removeTubeMeshes(tubeMeshMapRef.current, '__tube_preview__');

      // Create a temporary preview tube mesh
      const previewCfg: TubeConfig = { ...info.config, id: '__tube_preview__' };
      tubeMeshMapRef.current['__tube_preview__'] = createTubeMeshes(scene, previewCfg, null);
      renderMockupLabels(tubeMeshMapRef.current);
    },
    [tubePanelOpen],
  );

  const handleSaveTube = useCallback(
    async (cfg: TubeConfig) => {
      let updated: TubeConfig[];
      if (tubeEditIdx !== null) {
        // Remove old mesh
        const oldId = tubes[tubeEditIdx]?.id;
        if (oldId) removeTubeMeshes(tubeMeshMapRef.current, oldId);
        updated = tubes.map((t, i) => (i === tubeEditIdx ? cfg : t));
      } else {
        updated = [...tubes, cfg];
      }
      setTubes(updated);
      clearPreview();
      setTubePanelOpen(false);
      setTubeEditIdx(null);

      // Remove preview tube and rebuild all
      removeTubeMeshes(tubeMeshMapRef.current, '__tube_preview__');
      const scene = sceneCtxRef.current?.scene;
      if (scene) {
        disposeAllTubes(tubeMeshMapRef.current);
        for (const tc of updated) {
          tubeMeshMapRef.current[tc.id] = createTubeMeshes(scene, tc, null);
        }
      }

      try {
        persistActiveFloor({ tubes: updated });
        showToast('Tube saved & synced to server');
      } catch (e) {
        console.error('[Config] Auto-save failed:', e);
        showToast('Tube saved locally (server sync failed)');
      }
    },
    [tubes, tubeEditIdx, clearPreview, showToast],
  );

  // Hide the tube being edited (show only the preview), keep others visible
  useEffect(() => {
    if (tubePanelOpen && tubeEditIdx !== null) {
      const editedId = tubes[tubeEditIdx]?.id;
      if (editedId) {
        const entry = tubeMeshMapRef.current[editedId];
        if (entry) {
          for (const m of entry.tubes) m.setEnabled(false);
          for (const l of entry.labels) l.plane.setEnabled(false);
          for (const pe of entry.particles) {
            for (const s of pe.spheres) s.setEnabled(false);
          }
        }
      }
    }
  }, [tubePanelOpen, tubeEditIdx, tubes]);

  // Attach a position gizmo to the tube endpoint when editing
  useEffect(() => {
    const scene = sceneCtxRef.current?.scene;
    if (!tubePanelOpen || !scene) return;

    // Create a small anchor sphere at the endpoint
    const anchor = MeshBuilder.CreateSphere('tube-endpoint-anchor', { diameter: 0.15 }, scene);
    anchor.position = new Vector3(positionRef.current.x, 0, positionRef.current.z);
    anchor.isPickable = false;
    const mat = new StandardMaterial('tube-anchor-mat', scene);
    mat.emissiveColor = new Color3(0.2, 0.7, 1.0);
    mat.alpha = 0.7;
    mat.disableLighting = true;
    anchor.material = mat;
    tubeAnchorRef.current = anchor;

    // Attach gizmo
    if (!utilLayerRef.current) {
      utilLayerRef.current = new UtilityLayerRenderer(scene);
    }
    if (gizmoRef.current) {
      gizmoRef.current.dispose();
      gizmoRef.current = null;
    }
    const gizmo = new PositionGizmo(utilLayerRef.current);
    gizmo.scaleRatio = 1.2;
    gizmo.attachedMesh = anchor;
    // Disable Y axis — tubes only move in X/Z
    gizmo.yGizmo.dispose();

    const onDragStart = () => {
      draggingGizmoRef.current = true;
      posUndoStackRef.current.push({ ...positionRef.current });
    };
    const onDrag = () => {
      const p = anchor.position;
      const newPos: LightPosition = {
        x: parseFloat(p.x.toFixed(3)),
        y: 0,
        z: parseFloat(p.z.toFixed(3)),
      };
      positionRef.current = newPos;
      setPosition(newPos);
    };
    const onDragEnd = () => {
      draggingGizmoRef.current = false;
      document.dispatchEvent(new Event('tour:gizmo-used'));
      // Force tube preview rebuild at final position
      setPosition({ ...positionRef.current });
    };
    for (const ax of [gizmo.xGizmo, gizmo.zGizmo]) {
      ax.dragBehavior.onDragStartObservable.add(onDragStart);
      ax.dragBehavior.onDragObservable.add(onDrag);
      ax.dragBehavior.onDragEndObservable.add(onDragEnd);
    }
    // Semi-transparent arrows
    for (const m of utilLayerRef.current!.utilityLayerScene.meshes) {
      if (m.material) {
        (m.material as StandardMaterial).alpha = 0.5;
      }
    }
    gizmoRef.current = gizmo;

    return () => {
      gizmo.dispose();
      if (gizmoRef.current === gizmo) gizmoRef.current = null;
      anchor.material?.dispose();
      anchor.dispose();
      tubeAnchorRef.current = null;
    };
  }, [tubePanelOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync tube anchor position during gizmo drag (skip tube rebuild)
  useEffect(() => {
    if (!tubePanelOpen) return;
    if (draggingGizmoRef.current && tubeAnchorRef.current) {
      tubeAnchorRef.current.position.set(position.x, 0, position.z);
      return;
    }
    // Position changed from sliders/placing — sync anchor
    if (tubeAnchorRef.current) {
      tubeAnchorRef.current.position.set(position.x, 0, position.z);
    }
  }, [position, tubePanelOpen]);

  // Show/hide tube editor meshes when switching to/from tubes tab
  useEffect(() => {
    if (editorMode === 'tubes' && !tubePanelOpen) {
      rebuildTubeEditorMeshes(tubes);
    } else if (editorMode !== 'tubes') {
      disposeAllTubes(tubeMeshMapRef.current);
    }
  }, [editorMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update tube preview when endpoint position changes (skip during gizmo drag)
  useEffect(() => {
    if (!tubePanelOpen) return;
    if (draggingGizmoRef.current) return; // anchor moves via gizmo, rebuild on drag end
    const info = tubePreviewInfoRef.current;
    if (!info) return;

    const scene = sceneCtxRef.current?.scene;
    if (!scene) return;

    // Rebuild preview tube at new position
    removeTubeMeshes(tubeMeshMapRef.current, '__tube_preview__');
    const previewCfg: TubeConfig = {
      ...info.config,
      id: '__tube_preview__',
      endX: position.x,
      endZ: position.z,
    };
    tubeMeshMapRef.current['__tube_preview__'] = createTubeMeshes(scene, previewCfg, null);
    renderMockupLabels(tubeMeshMapRef.current);
  }, [position, tubePanelOpen]);

  // Save config to server
  const handleSaveConfig = useCallback(async () => {
    try {
      // The current editor arrays belong to the active floor.
      persistActiveFloor({ lights, lightGroups, displays, covers, shadowWalls, tubes, staircases, cameras });
      showToast(`Saved floor "${floors.find((f) => f.id === editFloorId)?.name ?? ''}" (${lights.length} lights, ${covers.length} covers, ${cameras.length} cams)`);
    } catch (e) {
      alert('Failed to save config: ' + (e instanceof Error ? e.message : e));
    }
  }, [lights, lightGroups, displays, covers, shadowWalls, tubes, staircases, cameras, floors, editFloorId, persistActiveFloor, showToast]);

  // Reload config from storage and rebuild the current floor
  const handleLoadConfig = useCallback(async () => {
    try {
      const config = await getConfig();
      configRef.current = config;
      const floorList = getFloors(config);
      setFloors(floorList);
      const active = floorList.find((f) => f.id === editFloorIdRef.current) ?? floorList[0];
      setEditFloorId(active.id);
      editFloorIdRef.current = active.id;
      await loadFloorIntoEditor(active);
      showToast(`Loaded floor "${active.name}"`);
    } catch (e) {
      alert('Failed to load config: ' + (e instanceof Error ? e.message : e));
    }
  }, [loadFloorIntoEditor, showToast]);

  return (
    <div className="config-editor">
      {/* Sidebar */}
      <div className="editor-sidebar">
        <div className="sidebar-header">
          <span className="sidebar-title">&#9881; Editor</span>
          <div className="sidebar-header-actions">
            <Link to="/" className="back-btn">
              &larr; Dashboard
            </Link>
          </div>
        </div>

        {/* Floor selector */}
        <div className="floor-bar">
          <input
            ref={floorFileRef}
            type="file"
            accept=".glb"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUploadFloorModel(f);
              e.target.value = '';
            }}
          />
          <select
            value={editFloorId}
            onChange={(e) => switchEditFloor(e.target.value)}
            title="Floor being edited"
          >
            {floors.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          <button className="floor-bar-btn" title="Upload this floor's model" onClick={() => floorFileRef.current?.click()}>⬆</button>
          <button className="floor-bar-btn" title="Rename floor" onClick={handleRenameFloor}>✎</button>
          <button className="floor-bar-btn" title="Add floor" onClick={handleAddFloor}>+</button>
          <button className="floor-bar-btn" title="Delete floor" onClick={handleDeleteFloor}>&times;</button>
        </div>

        {/* Mode tabs */}
        <div className="editor-tabs">
          <button
            className={`editor-tab${editorMode === 'lights' ? ' active' : ''}`}
            onClick={() => setEditorMode('lights')}
          >
            Lights ({lights.length})
          </button>
          <button
            className={`editor-tab${editorMode === 'displays' ? ' active' : ''}`}
            data-tab="displays"
            onClick={() => setEditorMode('displays')}
          >
            Displays ({displays.length})
          </button>
          <button
            className={`editor-tab${editorMode === 'covers' ? ' active' : ''}`}
            data-tab="covers"
            onClick={() => setEditorMode('covers')}
          >
            Covers ({covers.length})
          </button>
          <button
            className={`editor-tab${editorMode === 'walls' ? ' active' : ''}`}
            data-tab="walls"
            onClick={() => setEditorMode('walls')}
          >
            Walls ({shadowWalls.length})
          </button>
          <button
            className={`editor-tab${editorMode === 'tubes' ? ' active' : ''}`}
            data-tab="tubes"
            onClick={() => setEditorMode('tubes')}
          >
            Tubes ({tubes.length})
          </button>
          <button
            className={`editor-tab${editorMode === 'stairs' ? ' active' : ''}`}
            data-tab="stairs"
            onClick={() => setEditorMode('stairs')}
          >
            Stairs ({staircases.length})
          </button>
          <button
            className={`editor-tab${editorMode === 'cameras' ? ' active' : ''}`}
            data-tab="cameras"
            onClick={() => setEditorMode('cameras')}
          >
            Cameras ({cameras.length})
          </button>
        </div>

        <div className="light-list">
          {editorMode === 'lights' ? (
            <LightList
              lights={lights}
              lightGroups={lightGroups}
              selectedIdx={editIdx}
              onSelect={handleEditLight}
              onDelete={handleDeleteLight}
              onDuplicate={handleDuplicateLight}
              onReorder={handleReorderLight}
              onMoveToGroup={handleMoveToGroup}
              onAddGroup={handleAddGroup}
              onRenameGroup={handleRenameGroup}
              onDeleteGroup={handleDeleteGroup}
            />
          ) : editorMode === 'displays' ? (
            <DisplayList
              displays={displays}
              selectedIdx={displayEditIdx}
              onSelect={handleEditDisplay}
              onDelete={handleDeleteDisplay}
              onDuplicate={handleDuplicateDisplay}
            />
          ) : editorMode === 'covers' ? (
            <CoverList
              covers={covers}
              selectedIdx={coverEditIdx}
              onSelect={handleEditCover}
              onDelete={handleDeleteCover}
              onDuplicate={handleDuplicateCover}
            />
          ) : editorMode === 'walls' ? (
            <ShadowWallList
              walls={shadowWalls}
              selectedIdx={wallEditIdx}
              onSelect={handleEditWall}
              onDelete={handleDeleteWall}
              onDuplicate={handleDuplicateWall}
            />
          ) : editorMode === 'tubes' ? (
            <TubeList
              tubes={tubes}
              selectedIdx={tubeEditIdx}
              onSelect={handleEditTube}
              onDelete={handleDeleteTube}
              onDuplicate={handleDuplicateTube}
            />
          ) : editorMode === 'stairs' ? (
            <StaircaseList
              staircases={staircases}
              floorNames={floorNameMap(floors)}
              selectedIdx={staircaseEditIdx}
              onSelect={handleEditStaircase}
              onDelete={handleDeleteStaircase}
              onDuplicate={handleDuplicateStaircase}
            />
          ) : (
            <CameraList
              cameras={cameras}
              selectedIdx={cameraEditIdx}
              onSelect={handleEditCamera}
              onDelete={handleDeleteCamera}
              onDuplicate={handleDuplicateCamera}
            />
          )}
        </div>

        <div className="sidebar-footer">
          {editorMode === 'lights' ? (
            <button className="btn btn-primary editor-add-btn" onClick={handleAddLight}>
              + Add Light
            </button>
          ) : editorMode === 'displays' ? (
            <button className="btn btn-primary editor-add-btn" onClick={handleAddDisplay}>
              + Add Display
            </button>
          ) : editorMode === 'covers' ? (
            <button className="btn btn-primary editor-add-btn" onClick={handleAddCover}>
              + Add Cover
            </button>
          ) : editorMode === 'walls' ? (
            <button className="btn btn-primary editor-add-btn" onClick={handleAddWall}>
              + Add Wall
            </button>
          ) : editorMode === 'tubes' ? (
            <button className="btn btn-primary editor-add-btn" onClick={handleAddTube}>
              + Add Tube
            </button>
          ) : editorMode === 'stairs' ? (
            <button
              className="btn btn-primary editor-add-btn"
              onClick={handleAddStaircase}
              disabled={floors.length < 2}
              title={floors.length < 2 ? 'Add another floor first' : undefined}
            >
              + Add Staircase
            </button>
          ) : (
            <button className="btn btn-primary editor-add-btn" onClick={handleAddCamera}>
              + Add Camera
            </button>
          )}
          <button className="btn btn-ghost" onClick={handleLoadConfig}>
            &uarr; Reload from server
          </button>
          <button className="btn btn-success" onClick={handleSaveConfig}>
            &darr; Save to server
          </button>
        </div>
      </div>

      {/* 3D Canvas */}
      <div className="canvas-area editor-canvas">
        <canvas ref={canvasRef} />
        <div className={`mode-banner${placingMode ? ' visible' : ''}`}>
          {displayPanelOpen ? 'Click on a wall surface to place display' : coverPanelOpen ? 'Click the center of a window to place the shutter' : wallPanelOpen ? 'Click on the model to place wall' : staircasePanelOpen ? 'Click an open spot on the floor to place the staircase' : cameraPanelOpen ? 'Click a ceiling spot to mount the camera' : 'Click on the model to place light'}
        </div>
        <div className="coord-readout">{coordText}</div>
        <div className={`toast${toastVisible ? ' show' : ''}`}>{toastMsg}</div>

        <LightForm
          ref={lightFormRef}
          open={panelOpen}
          editLight={editIdx !== null ? lights[editIdx] : null}
          position={position}
          onPositionChange={handlePositionChange}
          onSave={handleSaveLight}
          onClose={handleClosePanel}
          onEnterPlacingMode={enterPlacingMode}
          onExitPlacingMode={exitPlacingMode}
          onPreviewChange={handlePreviewChange}
          placingMode={placingMode}
          haEntities={haEntities}
        />

        <DisplayForm
          open={displayPanelOpen}
          editDisplay={displayEditIdx !== null ? displays[displayEditIdx] : null}
          position={position}
          normal={displayNormal}
          onPositionChange={handlePositionChange}
          onSave={handleSaveDisplay}
          onClose={handleCloseDisplayPanel}
          onEnterPlacingMode={enterPlacingMode}
          onExitPlacingMode={exitPlacingMode}
          onPreviewChange={handleDisplayPreviewChange}
          placingMode={placingMode}
          haEntities={haEntities}
        />

        <CoverForm
          open={coverPanelOpen}
          editCover={coverEditIdx !== null ? covers[coverEditIdx] : null}
          position={position}
          normal={coverNormal}
          onPositionChange={handlePositionChange}
          onSave={handleSaveCover}
          onClose={handleCloseCoverPanel}
          onEnterPlacingMode={enterPlacingMode}
          onExitPlacingMode={exitPlacingMode}
          onPreviewChange={handleCoverPreviewChange}
          placingMode={placingMode}
          haEntities={haEntities}
        />

        <ShadowWallForm
          open={wallPanelOpen}
          editWall={wallEditIdx !== null ? shadowWalls[wallEditIdx] : null}
          position={position}
          onPositionChange={handlePositionChange}
          onSave={handleSaveWall}
          onClose={handleCloseWallPanel}
          onEnterPlacingMode={enterPlacingMode}
          onExitPlacingMode={exitPlacingMode}
          onPreviewChange={handleWallPreviewChange}
          placingMode={placingMode}
        />

        <TubeForm
          open={tubePanelOpen}
          editTube={tubeEditIdx !== null ? tubes[tubeEditIdx] : null}
          position={position}
          onPositionChange={handlePositionChange}
          onSave={handleSaveTube}
          onClose={handleCloseTubePanel}
          onPreviewChange={handleTubePreviewChange}
          haEntities={haEntities}
        />

        <StaircaseForm
          open={staircasePanelOpen}
          editStaircase={staircaseEditIdx !== null ? staircases[staircaseEditIdx] : null}
          position={position}
          onPositionChange={handlePositionChange}
          onSave={handleSaveStaircase}
          onClose={handleCloseStaircasePanel}
          onEnterPlacingMode={enterPlacingMode}
          onExitPlacingMode={exitPlacingMode}
          onPreviewChange={handleStaircasePreviewChange}
          placingMode={placingMode}
          floors={floors.filter((f) => f.id !== editFloorId).map((f) => ({ id: f.id, name: f.name }))}
        />

        <CameraForm
          open={cameraPanelOpen}
          editCamera={cameraEditIdx !== null ? cameras[cameraEditIdx] : null}
          position={position}
          orientation={cameraOrient}
          onPositionChange={handlePositionChange}
          onOrientationChange={setCameraOrient}
          onSave={handleSaveCamera}
          onClose={handleCloseCameraPanel}
          onEnterPlacingMode={enterPlacingMode}
          onExitPlacingMode={exitPlacingMode}
          placingMode={placingMode}
          haEntities={haEntities}
        />
      </div>

      {showGuidedTour && (
        <GuidedTour
          steps={editorTourSteps}
          onComplete={() => {
            setShowGuidedTour(false);
            // Clean the URL param
            navigate('/editor', { replace: true });
          }}
        />
      )}
    </div>
  );
}
