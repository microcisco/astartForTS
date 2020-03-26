import {AutoFindPath, models} from "./AutoFindPath";

const {ccclass, property} = cc._decorator;

@ccclass
export default class Helloworld extends cc.Component {

    @property({displayName: '地图', type: cc.Node})
    map: cc.Node = null;

    @property({displayName: '障碍物集合', type: cc.Node})
    obstacles: cc.Node = null;

    private autoFindPath: AutoFindPath = null;

    private customGenerateLogicMap() {
        let mapData = AutoFindPath.formatToMapData(this.map, this.map.children[0].width);
        let autoFindPath = new AutoFindPath(mapData);
        this.autoFindPath = autoFindPath;
        //更新当前地图里所有障碍物
        for (const child of this.obstacles.children) autoFindPath.updateMap(child);
    }

    private searchPath() {
        let pos0 = cc.find('Canvas/起点');
        let pos1 = cc.find('Canvas/终点');
        let paths = this.autoFindPath.gridPositionConvertGameObjectPosition(this.autoFindPath.findGridPath(pos0, pos1, models.normal),
            cc.v2(0.5, 0.5), cc.Vec2);
        if (paths.length === 0) console.log('死路');
        for (let i = 0; i < paths.length; i++) {
            this.scheduleOnce(() => {
                pos0.runAction(cc.moveTo(0.5, paths[i]));
            }, i * 0.5);
        }
    }

    start() {
        this.customGenerateLogicMap();
        this.searchPath();
    }
}
