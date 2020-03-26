export interface Vector2 {
    x: number;
    y: number;
}

export interface Size {
    width: number;
    height: number;
}

interface V2<T> {
    new(x: number, y: number): T;
}

//寻路的路点信息
class PathPointData implements Vector2 {
    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
    }

    x: number = 0;  //X axis position
    y: number = 0;  //Y axis position
    F: number = 0;  //G + H + K
    G: number = 0;  //开始点到当前路点的移动量
    H: number = 0;  //当前路点到目标点的移动量估值
    parent: PathPointData = null;  //上一个节点
    K: number = lands.normal  //地形值

}

export type GameObject = Size & Vector2 & { anchorX: number, anchorY: number, angle: number };

//模式
export const enum models {
    normal,  //普通的
    tilt,    //倾斜的
}

//地形
export const enum lands {
    normal = 1,  //普通的
    hard = 2,    //类似沼泽之类的
}

/**@description 每张地图对应一个寻路实例。 全部给世界坐标，返回的也全部是世界坐标*/
export class AutoFindPath {
    //分隔符
    private static sep: string = "_";
    //模式
    private model: models = models.tilt;
    //地图映射   格子坐标<>当前格子的K数值（K值用于处理不同的地形）
    private mapTable: Map<string, PathPointData> = new Map<string, PathPointData>();
    //open列表
    private openList: PathPointData[] = [];
    private openListMap: Map<string, PathPointData> = new Map<string, PathPointData>();
    //closed列表
    private fixClosedListMap: Map<string, PathPointData> = new Map<string, PathPointData>();
    private closedListMap: Map<string, PathPointData> = new Map<string, PathPointData>();
    //出生点
    private bronPoint: PathPointData = null;
    //目标点
    private targetPoint: PathPointData = null;
    //当前寻路点
    private nowPoint: PathPointData = null;
    //地图数据
    private readonly mapData: GameObject & { gridLength: number } = null;

    /**@description 格式化成地图数据*/
    public static formatToMapData(gameObject: GameObject, gridLength: number): GameObject & { gridLength: number } {
        return {
            anchorY: gameObject.anchorY,
            anchorX: gameObject.anchorX,
            height: gameObject.height,
            width: gameObject.width,
            x: gameObject.x,
            y: gameObject.y,
            gridLength: gridLength,
            angle: -gameObject.angle
        };
    }

    /**@description 根据格子对象获取对应的key值*/
    private static getKey(p: Vector2) {
        return p.x.toString() + AutoFindPath.sep + p.y.toString();
    }

    /**@description 添加到openList*/
    private addToOpenList(v2: PathPointData) {
        let p = AutoFindPath.getKey(v2);
        if (this.mapTable.get(p) === void 0) throw new Error('this point not in map');
        if (this.openListMap.get(p)) {
            //该点已经在open列表中 && 重新计算F值 && 新F值更低就将父方格修改为当前节点否则什么都不做
            let oldParent = v2.parent;
            let oldF = v2.F;
            v2.parent = this.nowPoint;
            this.F(v2);
            if (v2.F > oldF) {
                v2.parent = oldParent;
                this.F(v2);
                return;
            }
            return;
        } else {
            v2.parent = this.nowPoint;  //设置父方格
            this.F(v2);  //计算F值
        }
        this.openList.push(v2);
        this.openListMap.set(p, this.mapTable.get(p));
    }

    /**@description 是否已经在closedList中*/
    private isInClosedList(p: Vector2) {
        let key = AutoFindPath.getKey(p);
        return !!(this.fixClosedListMap.get(key) || this.closedListMap.get(key));
    }

    /**@description 移除最小F值的路点*/
    private removeMinFFromOpenList(): PathPointData {
        //排序
        this.openList.sort((a: PathPointData, b: PathPointData) => {
            if (a.F > b.F) return -1;
            return 1
        });
        let v2: PathPointData = this.openList.pop();
        v2 && this.removeFromOpenList(v2);
        return v2;
    }

    /**@description 移除最小F值的路点*/
    private removeFromOpenList(v2: PathPointData) {
        let p = AutoFindPath.getKey(v2);
        if (!this.openListMap.has(p)) throw new Error('not in openList');
        this.openListMap.delete(p);
    }

    /**@description 添加到closedList*/
    private addToClosedList(v2: PathPointData) {
        let p = AutoFindPath.getKey(v2);
        if (this.mapTable.get(p) === void 0) throw new Error('this point not in map');
        if (this.closedListMap.get(p)) throw new Error('is in closedList');
        this.closedListMap.set(p, this.mapTable.get(p));
    }

    // 单次寻路最大限制次数
    private readonly searchLimit: number = 688;

    /**@description 构造函数
     * @param mapData 地图坐标，地图尺寸，格子尺寸
     * @param obstacles 障碍物坐标及尺寸
     * */
    public constructor(mapData: GameObject & { gridLength: number, searchLimit?: number }, obstacles?: GameObject[]) {
        if (mapData.searchLimit > 0) this.searchLimit = mapData.searchLimit;
        mapData.x = mapData.x - mapData.width * mapData.anchorX;
        mapData.y = mapData.y - mapData.height * mapData.anchorY;
        this.mapData = mapData;
        for (let i = 0, i1 = Math.ceil(mapData.width / this.mapData.gridLength); i < i1; ++i) {
            for (let j = 0, j1 = Math.ceil(mapData.height / this.mapData.gridLength); j < j1; ++j) {
                this.mapTable.set(i.toString() + AutoFindPath.sep + j.toString(), new PathPointData(i, j));
            }
        }
        if (obstacles) this.updateMap(...obstacles);
    }

    /**@description 根据游戏对象获取格子*/
    private getGridPositions(nodeData: GameObject): string[] {
        let vec2s: string[] = [];
        let width = nodeData.width;
        let height = nodeData.height;
        if (nodeData.angle === -90 || nodeData.angle === -270) {
            width = width + height;
            height = width - height;
            width = width - height;
        }
        let minX = nodeData.x - width * nodeData.anchorX;
        let maxX = nodeData.x + width * (1 - nodeData.anchorX);
        let minY = nodeData.y - height * nodeData.anchorY;
        let maxY = nodeData.y + height * (1 - nodeData.anchorY);
        let minPoint = this.getGridPositionRaw({x: minX, y: minY});
        let w = this.getGridPositionRaw({x: maxX, y: minY}).x - minPoint.x + 1;
        let h = this.getGridPositionRaw({x: minX, y: maxY}).y - minPoint.y + 1;
        let startGridX = minPoint.x;
        let startGridY = minPoint.y;
        for (let i = 0, i1 = w; i < i1; ++i) {
            for (let j = 0, j1 = h; j < j1; ++j) {
                let key = (i + startGridX).toString() + AutoFindPath.sep + (startGridY + j).toString();
                if (this.mapTable.get(key) === void 0) continue;  //超出地图不做处理
                vec2s.push(key);
            }
        }
        return vec2s;
    }

    /**@description 根据游戏对象获取格子（可能不在地图中）*/
    private getGridPositionRaw(v2: Vector2): Vector2 {
        return {
            x: Math.floor((v2.x - this.mapData.x) / this.mapData.gridLength),
            y: Math.floor((v2.y - this.mapData.y) / this.mapData.gridLength)
        };
    }

    /**@description 根据游戏对象获取格子*/
    public getGridPosition(v2: Vector2): PathPointData {
        return this.mapTable.get(AutoFindPath.getKey(this.getGridPositionRaw(v2)));
    }

    /**@description 更新地图信息*/
    updateMap(...obstacles: GameObject[]) {
        for (const obstacle of obstacles) {
            if (obstacle.width * obstacle.height < 2) continue;  //尺寸过小忽略
            for (const gridPositionKey of this.getGridPositions(obstacle)) {
                this.fixClosedListMap.set(gridPositionKey, this.mapTable.get(gridPositionKey));
            }
        }
    }

    /**@description 更新地图信息*/
    removeFixObstacle(...obstacles: GameObject[]) {
        for (const obstacle of obstacles) {
            for (const gridPositionKey of this.getGridPositions(obstacle)) {
                this.fixClosedListMap.delete(gridPositionKey);
            }
        }
    }

    /**@description 更新地图信息*/
    removeAllObstacle() {
        this.fixClosedListMap.clear();
    }

    /**@description 自动寻找新路点并根据F值排序*/
    private autoAddPathPoint() {
        //上
        let p0 = {x: this.nowPoint.x, y: this.nowPoint.y + 1};
        //右
        let p1 = {x: this.nowPoint.x + 1, y: this.nowPoint.y};
        //下
        let p2 = {x: this.nowPoint.x, y: this.nowPoint.y - 1};
        //左
        let p3 = {x: this.nowPoint.x - 1, y: this.nowPoint.y};
        let maybePoints: Vector2[] = [p0, p1, p2, p3];
        if (this.model === models.tilt) {
            if (!this.isInClosedList(p0) && !this.isInClosedList(p1)) {
                //右上角 && 上和右不能有阻挡
                maybePoints.push({x: this.nowPoint.x + 1, y: this.nowPoint.y + 1});
            }
            if (!this.isInClosedList(p2) && !this.isInClosedList(p1)) {
                //右下角 && 下和右不能有阻挡
                maybePoints.push({x: this.nowPoint.x + 1, y: this.nowPoint.y - 1});
            }
            if (!this.isInClosedList(p0) && !this.isInClosedList(p3)) {
                //左上角 && 上和左不能有阻挡
                maybePoints.push({x: this.nowPoint.x - 1, y: this.nowPoint.y + 1});
            }
            if (!this.isInClosedList(p2) && !this.isInClosedList(p3)) {
                //左下角 && 下和左不能有阻挡
                maybePoints.push({x: this.nowPoint.x - 1, y: this.nowPoint.y - 1});
            }
        }

        let targetPointKey = AutoFindPath.getKey(this.targetPoint);
        for (const point of maybePoints) {
            let key = AutoFindPath.getKey(point);
            let pathPoint = this.mapTable.get(key);
            if (pathPoint === void 0) continue;
            //有障碍物在终点做特殊处理
            if (!this.isInClosedList(pathPoint) || key === targetPointKey) this.addToOpenList(pathPoint);
        }
    }

    /**
     * @description 寻路
     * @param {Vector2} bornPoint  出身点
     * @param {Vector2} targetPoint 目标点
     * @param {models} model 寻路模式
     * */
    public findGridPath(bornPoint: GameObject | Vector2, targetPoint: GameObject | Vector2, model: models): Vector2[] {
        this.clear();
        this.model = model;  //寻路模式
        let p1: PathPointData = this.getGridPosition(bornPoint);
        let p2: PathPointData = this.getGridPosition(targetPoint);
        if (!p1 || !p2 ||
            this.fixClosedListMap.get(AutoFindPath.getKey(p1))
        ) return [];  //起点有问题

        this.nowPoint = this.bronPoint = this.mapTable.get(AutoFindPath.getKey(p1));
        this.targetPoint = this.mapTable.get(AutoFindPath.getKey(p2));
        let paths: Vector2[] = [];  //路径
        if (AutoFindPath.getKey(p1) === AutoFindPath.getKey(p2)) return paths;  //终点和起点重合
        let maxSearchAmount = 0;  //重置搜寻次数
        while (!this.closedListMap.get(AutoFindPath.getKey(this.targetPoint))) {
            this.addToClosedList(this.nowPoint);
            //自动增加新路点
            this.autoAddPathPoint();
            //移动到最小F值的路点 && 移除最小路点
            this.nowPoint = this.removeMinFFromOpenList();
            if (this.nowPoint === void 0) return paths;  //死路
            if (AutoFindPath.getKey(this.nowPoint) === AutoFindPath.getKey(this.targetPoint)) break;
            //达到搜寻次数直接返回 && 避免卡顿
            if (++maxSearchAmount > this.searchLimit) return paths;
        }
        //反向寻路
        let nowPointKey = AutoFindPath.getKey(this.targetPoint);
        let bornPointKey = AutoFindPath.getKey(this.bronPoint);
        do {
            let pathPointData = this.mapTable.get(nowPointKey);
            paths.push(pathPointData);
            nowPointKey = AutoFindPath.getKey(pathPointData.parent);
        } while (nowPointKey !== bornPointKey);
        return paths.reverse();
    }

    /**@description 格子坐标转换为和地图同一坐标系的坐标
     * @param {Array}  positions 格子坐标数组
     * @param {Vector2} anchor 各自坐标
     * @param {T} ctor 构造函数
     * */
    public gridPositionConvertGameObjectPosition<T>(positions: Vector2[], anchor: Vector2, ctor: V2<T>): T[] {
        let res: T[] = [];
        for (const position of positions) {
            let x = position.x * this.mapData.gridLength + this.mapData.x + this.mapData.gridLength * anchor.x;
            let y = position.y * this.mapData.gridLength + this.mapData.y + this.mapData.gridLength * anchor.y;
            res.push(new ctor(x, y));
        }
        return res;
    }

    /**@description 检测该点是否包含固定障碍物*/
    public hasObstacle(v2: Vector2) {
        let res = true;
        try {
            res = !!this.fixClosedListMap.get(AutoFindPath.getKey(this.getGridPosition(v2)));
        } catch (e) {

        }
        return res;
    }

    /**@description 清理数据*/
    private clear() {
        this.openList.length = 0;
        this.openListMap.clear();
        this.closedListMap.clear();
        this.bronPoint = null;
        this.targetPoint = null;
        this.nowPoint = null;
    }

    /**@description 计算F值*/
    private F(p: PathPointData) {
        AutoFindPath.G(p);
        this.H(p);
        p.F = p.G + p.H + p.K;
    }

    /**@description 计算到出生点的估值*/
    private static G(p: PathPointData) {
        if (p.parent.x === p.x || p.parent.y === p.y) {
            p.G = p.parent.G + 10;
        } else {
            p.G = p.parent.G + 14;
        }
    }

    /**@description 计算到目标点的估值*/
    private H(p: PathPointData) {
        p.H = Math.abs(this.targetPoint.x - p.x) * 10 + Math.abs(this.targetPoint.y - p.y) * 10;
    }
}
