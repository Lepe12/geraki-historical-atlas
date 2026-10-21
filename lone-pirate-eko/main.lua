-- Real Clawblox world: stationary ship reference frame, no scripted agent actions.
local Players=game:GetService("Players")
local Input=game:GetService("AgentInputService")
local RunService=game:GetService("RunService")
Workspace.Gravity=10
local function part(name,size,pos,col,anchored,collide)
 local o=Instance.new("Part");o.Name=name;o.Size=Vector3.new(size[1],size[2],size[3]);o.Position=Vector3.new(pos[1],pos[2],pos[3]);o.Color=Color3.fromRGB(col[1],col[2],col[3]);o.Anchored=anchored;o.CanCollide=collide~=false;o.Parent=Workspace;return o
end
local sea=part("OpenSea",{1600,.4,1600},{0,-4,0},{29,73,100},true,false);sea:SetAttribute("RenderRole","Ocean")
local deck=part("MainDeck",{14,1,37},{0,-.5,0},{103,66,39},true);deck:SetAttribute("RenderRole","Ground")
part("Keel",{10,5,34},{0,-3,0},{65,37,21},true)
for _,x in ipairs({-7,7}) do part("Bulwark"..x,{.5,2,36},{x,1,0},{72,42,24},true) end
for _,z in ipairs({-18,18}) do part("Rail"..z,{14,1.5,.6},{0,1,z},{72,42,24},true) end
part("Forecastle",{12,1,6},{0,1.2,-15},{113,76,44},true)
part("Quarterdeck",{12,1,7},{0,1.2,14},{113,76,44},true)
part("Mainmast",{1.3,16,1.3},{0,8,-2},{106,70,41},true)
part("Foremast",{1,12,1},{0,6,-12},{106,70,41},true)
part("MainYard",{13,.5,.5},{0,13,-2},{116,72,40},true)
local sail=part("Mainsail",{12,8,.18},{0,9,-2},{216,207,171},true,false);sail.Transparency=.8;sail:SetAttribute("SailState","furled")
part("Helm",{2,2,.4},{0,2.5,13},{163,113,57},true,false)
part("Hatch",{4,.15,4},{2,.1,5},{67,37,20},true,false)
for i=1,3 do
 part("PortCannon"..i,{2,1,1},{-5,.7,-12+i*8},{45,48,53},true)
 part("StarboardCannon"..i,{2,1,1},{5,.7,-12+i*8},{45,48,53},true)
end
local loose={}
local function carry(name,pos,col)
 local o=part(name,{1,1,1},pos,col,false);o:SetAttribute("IsPickupObject",true);o:SetAttribute("IsCarryable",true);o:SetAttribute("RenderRole","PickupObject");loose[name]=o
end
carry("RopeCoil",{-3,1,6},{177,137,83})
carry("NavigationBook",{3,1,13},{88,42,37})
carry("WoodBlock",{3,1,-4},{146,90,44})
carry("Bucket",{-3,1,-13},{106,93,74})
local held={}
local function root(p) return p.Character and p.Character:FindFirstChild("HumanoidRootPart") end
local function setup(p)
 local c=p.Character;local h=c and c:FindFirstChild("Humanoid");local r=root(p)
 if h then h.WalkSpeed=9;h.JumpPower=27 end
 if r then r.Position=Vector3.new(0,2.4,0) end
 if c then c:SetAttribute("ModelUrl","asset://player.glb") end
 p:SetAttribute("LastActionResult","Ready; no goals assigned")
end
Players.PlayerAdded:Connect(setup)
for _,p in ipairs(Players:GetPlayers()) do setup(p) end
local function near(p,o,max)
 local r=root(p);return r and o and (r.Position-o.Position).Magnitude<=max
end
local function get(name) return Workspace:FindFirstChild(name) end
Input.InputReceived:Connect(function(p,kind,data)
 data=data or {};local r=root(p);local h=p.Character and p.Character:FindFirstChild("Humanoid")
 if not r or not h then return end
 if kind=="MoveTo" and data.position then
  local v=data.position;local x,y,z=tonumber(v[1]),tonumber(v[2]),tonumber(v[3])
  if x and y and z and math.abs(x)<=6.5 and math.abs(z)<=17.5 and y>=0 and y<5 then h:MoveTo(Vector3.new(x,y,z));p:SetAttribute("LastActionResult","Moving") else p:SetAttribute("LastActionResult","Invalid deck destination") end
 elseif kind=="Stop" then h:CancelMoveTo();p:SetAttribute("LastActionResult","Stopped")
 elseif kind=="Jump" then h.Jump=true;p:SetAttribute("LastActionResult","Jumped")
 elseif kind=="Inspect" then
  local o=get(tostring(data.target or ""));p:SetAttribute("LastActionResult",o and ("Inspected "..o.Name.." at "..tostring(o.Position)) or "Unknown target")
 elseif kind=="Touch" then
  local o=get(tostring(data.target or ""));p:SetAttribute("LastActionResult",near(p,o,5) and ("Touched "..o.Name) or "Target out of reach")
 elseif kind=="Pickup" and data.position then
  local target=Vector3.new(tonumber(data.position[1]) or 0,tonumber(data.position[2]) or 0,tonumber(data.position[3]) or 0)
  local choice=nil;for _,o in pairs(loose) do if o.Parent and (o.Position-target).Magnitude<3 and near(p,o,5) then choice=o;break end end
  if choice and not held[p] then held[p]=choice;choice.CanCollide=false;p:SetAttribute("LastActionResult","Picked up "..choice.Name) else p:SetAttribute("LastActionResult","Pickup failed") end
 elseif kind=="Place" and data.position and held[p] then
  local v=data.position;local x,y,z=tonumber(v[1]),tonumber(v[2]),tonumber(v[3])
  if x and y and z and math.abs(x)<6.5 and math.abs(z)<17 then local o=held[p];held[p]=nil;o.Position=Vector3.new(x,math.max(.8,y),z);o.CanCollide=true;p:SetAttribute("LastActionResult","Placed "..o.Name) else p:SetAttribute("LastActionResult","Invalid placement") end
 elseif kind=="Steer" then
  if near(p,get("Helm"),5) and (data.direction=="port" or data.direction=="starboard" or data.direction=="center") then p:SetAttribute("LastActionResult","Helm adjusted "..data.direction) else p:SetAttribute("LastActionResult","Move to helm first") end
 elseif kind=="SetSail" then
  if near(p,get("Mainmast"),6) and (data.state=="raised" or data.state=="furled") then sail:SetAttribute("SailState",data.state);sail.Transparency=data.state=="raised" and .12 or .8;p:SetAttribute("LastActionResult","Sail "..data.state) else p:SetAttribute("LastActionResult","Move to mast first") end
 else p:SetAttribute("LastActionResult","Unknown action") end
end)
RunService.Heartbeat:Connect(function(dt)
 for p,o in pairs(held) do local r=root(p);if r and o.Parent then o.Position=r.Position+Vector3.new(0,2,0) end end
 for _,p in ipairs(Players:GetPlayers()) do local r=root(p);if r and r.Position.Y < -5 then r.Position=Vector3.new(0,2.4,0);p:SetAttribute("LastActionResult","Recovered to deck") end end
end)
