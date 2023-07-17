import { ExcalidrawAutomate } from "obsidian-excalidraw-plugin/lib/ExcalidrawAutomate";
import { ExcaliBrainSettings } from "src/Settings";
import { Dimensions, Mutable, NodeStyle } from "src/Types";
import { getTagStyle } from "src/utils/dataview";
import { Page } from "./Page";
import { ExcalidrawImageElement } from "@zsviczian/excalidraw/types/element/types";
import { Widget } from "obsidian-dataview";
import { isEmbedFileType } from "src/utils/fileUtils";

export class Node {
  page: Page;
  settings: ExcaliBrainSettings;
  ea: ExcalidrawAutomate;
  style: NodeStyle = {};
  private center: {x:number, y:number} = {x:0,y:0};
  public id: string;
  public friendGateId: string;
  public nextFriendGateId: string; // for central nodes
  public parentGateId: string;
  public childGateId: string;
  private friendGateOnLeft: boolean;
  public title: string;
  public isCentral: boolean = false;
  public isEmbedded: boolean = false;
  public embeddedElementIds: string[] = [];

  constructor(x:{
    ea: ExcalidrawAutomate,
    page:Page,
    isInferred: boolean,
    isCentral: boolean,
    isSibling: boolean,
    friendGateOnLeft:boolean,
    isEmbeded?: boolean,
    embeddedElementIds?: string[],
  }) {
    if(x.embeddedElementIds) {
      this.embeddedElementIds = x.embeddedElementIds;
    }
    this.isEmbedded = Boolean(x.isEmbeded);
    this.isCentral = x.isCentral;
    this.page = x.page;
    this.settings = x.page.plugin.settings;
    this.ea = x.ea;
    if(this.page.isFolder) {
      this.style = {
        ...this.settings.baseNodeStyle,
        ...x.isCentral?this.settings.centralNodeStyle:{},
        ...x.isSibling?this.settings.siblingNodeStyle:{},
        ...this.settings.folderNodeStyle
      }
    } else if (this.page.isTag) {
      this.style = {
        ...this.settings.baseNodeStyle,
        ...x.isCentral?this.settings.centralNodeStyle:{},
        ...x.isSibling?this.settings.siblingNodeStyle:{},
        ...this.settings.tagNodeStyle
      }
    } else {
      this.style = {
        ...this.settings.baseNodeStyle,
        ...x.isInferred?this.settings.inferredNodeStyle:{},
        ...x.page.isVirtual?this.settings.virtualNodeStyle:{},
        ...x.isCentral?this.settings.centralNodeStyle:{},
        ...x.isSibling?this.settings.siblingNodeStyle:{},
        ...x.page.isAttachment?this.settings.attachmentNodeStyle:{},
        ...getTagStyle(this.page.primaryStyleTag,this.settings),
        embedHeight: this.settings.centerEmbedHeight,
        embedWidth: this.settings.centerEmbedWidth,
      };
    }
    this.friendGateOnLeft = x.friendGateOnLeft;
    this.title = this.page.getTitle();
  }


  private displayText(): string {
    const label = (this.style.prefix??"") + this.title;
    return label.length > this.style.maxLabelLength
      ? label.substring(0,this.style.maxLabelLength-1) + "..."
      : label;
  }

  setCenter(center:{x:number, y:number}) {
    this.center = center;
  }


  async renderEmbedded():Promise<Dimensions> {
    const ea = this.ea;
    const maxDimensions = {width: this.style.embedWidth, height: this.style.embedHeight};
    if(isEmbedFileType(this.page.file, ea)) {
      this.id = ea.addEmbeddable(
        this.center.x - maxDimensions.width/2, 
        this.center.y - maxDimensions.height/2,
        maxDimensions.width,
        maxDimensions.height,
        undefined,
        this.page.file      
      );
      const box = ea.getElement(this.id) as any;
      box.backgroundColor = this.style.backgroundColor;
      box.strokeColor = this.style.borderColor;
      box.strokeStyle = this.style.strokeStyle;
      this.embeddedElementIds.push(this.id);
      return maxDimensions;
    } else {
      this.id = await ea.addImage(
        this.center.x - maxDimensions.width/2, 
        this.center.y - maxDimensions.height/2,
        this.page.file,
        false,
        false,
      )
      const imgEl = ea.getElement(this.id) as Mutable<ExcalidrawImageElement>;
      let width  = imgEl.width;
      let height = imgEl.height;    
    
      if (width > maxDimensions.width || height > maxDimensions.height) {
        const aspectRatio = width / height;
    
        if (width > maxDimensions.width) {
          width = maxDimensions.width;
          height = width / aspectRatio;
        }
    
        if (height > maxDimensions.height) {
          height = maxDimensions.height;
          width = height * aspectRatio;
        }
      }
    
      imgEl.x = this.center.x - width / 2;
      imgEl.y = this.center.y - height / 2;
      imgEl.width = width;
      imgEl.height = height;

      const id = ea.addRect(
        this.center.x - width / 2,
        this.center.y - height / 2,
        width,
        height
      );
      const box = ea.getElement(id) as any;
      box.backgroundColor = this.style.backgroundColor;
      box.strokeColor = this.style.borderColor;
      box.strokeStyle = this.style.strokeStyle;
      box.fillStyle = this.style.fillStyle;
      //hack to bring the image to the front
      delete ea.elementsDict[imgEl.id]
      ea.elementsDict[imgEl.id] = imgEl;
      this.embeddedElementIds.push(id);
      this.embeddedElementIds.push(this.id);
      return { width, height };
    }
  }

  renderText():Dimensions {
    const ea = this.ea;
    const label = this.displayText();
    const labelSize = ea.measureText(`${label}`);
    this.id = ea.addText(
      this.center.x - labelSize.width / 2, 
      this.center.y - labelSize.height / 2,
      label,
      {
        wrapAt: this.style.maxLabelLength+5,
        textAlign: "center",
        box: true,
        boxPadding: this.style.padding,
      }
    );
    const box = ea.getElement(this.id) as any;
    box.link = `[[${this.page.file?.path??this.page.path}]]`;
    box.backgroundColor = this.style.backgroundColor;
    box.strokeColor = this.style.borderColor;
    box.strokeStyle = this.style.strokeStyle;
    return labelSize;
  }

  async render() {
    const ea = this.ea;
    
    const gateDiameter = this.style.gateRadius*2;
    ea.style.fontSize = this.style.fontSize;
    ea.style.fontFamily = this.style.fontFamily;
    ea.style.fillStyle = this.style.fillStyle;
    ea.style.roughness = this.style.roughness;
    ea.style.strokeSharpness = this.style.strokeShaprness;
    ea.style.strokeWidth = this.style.strokeWidth;
    ea.style.strokeColor = this.style.textColor;
    ea.style.backgroundColor = "transparent";

    //if this.embeddedElementIds.length>0 then we are retaining the embedded element (so it does not reload)
    //Scene.render: retainCentralNode
    const labelSize = this.isEmbedded
      ? this.embeddedElementIds.length>0
        ? {width: this.style.embedWidth, height: this.style.embedHeight}
        : await this.renderEmbedded()
      : this.renderText();

    ea.style.fillStyle = this.style.gateFillStyle;
    ea.style.strokeColor = this.style.gateStrokeColor;
    ea.style.strokeStyle = "solid";

    const leftFriendCount = this.isCentral
      ? this.page.leftFriendCount()
      : this.page.leftFriendCount() + this.page.rightFriendCount();
    ea.style.backgroundColor =  leftFriendCount > 0 
      ? this.style.gateBackgroundColor
      : "transparent";
    this.friendGateId = ea.addEllipse(
      this.friendGateOnLeft
        ? this.center.x - gateDiameter - this.style.padding - labelSize.width / 2
        : this.center.x + this.style.padding + labelSize.width / 2,
      this.center.y - this.style.gateRadius,
      gateDiameter,
      gateDiameter
    );

    const neighborCountLabelIds = [];
    if(this.settings.showNeighborCount && leftFriendCount>0) {
      ea.style.fontSize = gateDiameter;
      neighborCountLabelIds.push(ea.addText(
        this.friendGateOnLeft
        ? leftFriendCount>9
          ? this.center.x - 2*gateDiameter - this.style.padding - labelSize.width / 2
          : this.center.x - gateDiameter - this.style.padding - labelSize.width / 2
        : this.center.x + this.style.padding + labelSize.width / 2,
        this.friendGateOnLeft
        ? this.center.y - 2*gateDiameter
        : this.center.y - this.style.gateRadius + gateDiameter,
        leftFriendCount.toString()
      ));
    }

    if(this.isCentral) {
      const rightFriendCount = this.page.rightFriendCount();
      ea.style.backgroundColor = rightFriendCount > 0 
        ? this.style.gateBackgroundColor
        : "transparent";
      this.nextFriendGateId = ea.addEllipse(
        !this.friendGateOnLeft
          ? this.center.x - gateDiameter - this.style.padding - labelSize.width / 2
          : this.center.x + this.style.padding + labelSize.width / 2,
        this.center.y - this.style.gateRadius,
        gateDiameter,
        gateDiameter
      );

      if(this.settings.showNeighborCount && rightFriendCount>0) {
        ea.style.fontSize = gateDiameter;
        neighborCountLabelIds.push(ea.addText(
          !this.friendGateOnLeft
          ? rightFriendCount>9
            ? this.center.x - 2*gateDiameter - this.style.padding - labelSize.width / 2
            : this.center.x - gateDiameter - this.style.padding - labelSize.width / 2
          : this.center.x + this.style.padding + labelSize.width / 2,
          !this.friendGateOnLeft
          ? this.center.y - 2*gateDiameter
          : this.center.y - this.style.gateRadius + gateDiameter,
          rightFriendCount.toString()
        ));
      } 
    } else {
      this.nextFriendGateId = this.friendGateId;
    }

    const parentCount = this.page.parentCount()
    ea.style.backgroundColor =  parentCount > 0
      ? this.style.gateBackgroundColor
      : "transparent";
    this.parentGateId = ea.addEllipse(
      this.center.x - this.style.gateRadius - this.style.gateOffset,
      this.center.y - gateDiameter - this.style.padding - labelSize.height / 2,
      gateDiameter,
      gateDiameter
    );
    if(this.settings.showNeighborCount && parentCount>0) {
      ea.style.fontSize = gateDiameter;
      neighborCountLabelIds.push(ea.addText(
        this.center.x + gateDiameter - this.style.gateOffset,
        this.center.y - gateDiameter - this.style.padding - labelSize.height / 2,
        parentCount.toString()
      ));
    }

    const childrenCount = this.page.childrenCount()
    ea.style.backgroundColor =  childrenCount > 0
      ? this.style.gateBackgroundColor
      : "transparent";
    this.childGateId = ea.addEllipse(
      this.center.x - this.style.gateRadius + this.style.gateOffset,
      this.center.y + this.style.padding + labelSize.height / 2,
      gateDiameter,
      gateDiameter
    );
    if(this.settings.showNeighborCount && childrenCount>0) {
      ea.style.fontSize = gateDiameter;
      neighborCountLabelIds.push(ea.addText(
        this.center.x + gateDiameter + this.style.gateOffset,
        this.center.y + this.style.padding + labelSize.height / 2,
        childrenCount.toString()
      ));
    }
    
    ea.addToGroup([
      this.friendGateId,
      this.parentGateId,
      this.childGateId,
      ...this.nextFriendGateId !== this.friendGateId ? [this.nextFriendGateId] : [],
      ...neighborCountLabelIds,
      ...this.isEmbedded
        ? this.embeddedElementIds
        : [this.id, ea.getElement(this.id).boundElements[0].id]
    ]);
  }

}