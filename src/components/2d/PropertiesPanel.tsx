import React, { useEffect, useState, useRef } from 'react';
import { 
  Box, 
  Typography, 
  TextField, 
  Divider, 
  List, 
  ListItem, 
  ListItemButton, 
  ListItemText, 
  ListItemIcon
} from '@mui/material';
import { useStore } from '../../store';
import { Outline, RoundedRectOutline } from '../../types';
import { GRID_SIZE, TOLERANCE, calculateMinimalGridArea } from '../../utils/grid';
import CropSquareRoundedIcon from '@mui/icons-material/CropSquareRounded';
import GestureIcon from '@mui/icons-material/Gesture';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Sortable item component
interface SortableItemProps {
  id: string;
  outline: Outline;
  onSelect: (id: string, multiSelect?: boolean) => void;
  onRename: (id: string, newName: string) => void;
}

const SortableItem: React.FC<SortableItemProps> = ({ id, outline, onSelect, onRename }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [nameValue, setNameValue] = useState(outline.name);
  const [isHovering, setIsHovering] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 1,
  };
  
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);
  
  const handleClick = (e: React.MouseEvent) => {
    if (outline.selected && !e.shiftKey) {
      setIsEditing(true);
    } else {
      onSelect(outline.id, e.shiftKey);
    }
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNameBlur();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setNameValue(outline.name);
    }
  };
  
  const handleNameBlur = () => {
    setIsEditing(false);
    if (nameValue.trim() && nameValue !== outline.name) {
      onRename(outline.id, nameValue);
    } else {
      setNameValue(outline.name);
    }
  };
  
  return (
    <ListItem 
      ref={setNodeRef}
      style={style}
      disablePadding
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      sx={{ 
        backgroundColor: outline.selected ? 'rgba(25, 118, 210, 0.12)' : 'transparent',
        '&:hover': {
          backgroundColor: outline.selected ? 'rgba(25, 118, 210, 0.2)' : 'rgba(0, 0, 0, 0.04)'
        }
      }}
    >
      <ListItemButton 
        onClick={handleClick}
        dense
        sx={{ pl: 2 }}
      >
        <ListItemIcon sx={{ minWidth: 36 }}>
          {outline.type === 'roundedRect' ? 
            <CropSquareRoundedIcon sx={{ color: outline.color }} /> : 
            <GestureIcon sx={{ color: outline.color }} />
          }
        </ListItemIcon>
        
        {isEditing ? (
          <TextField
            inputRef={inputRef}
            size="small"
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={handleNameBlur}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            variant="standard"
            autoComplete="off"
            fullWidth
            sx={{ ml: -1 }}
            InputProps={{
              sx: {
                fontSize: '0.875rem',
                fontWeight: 'bold'
              }
            }}
          />
        ) : (
          <ListItemText 
            primary={outline.name}
            primaryTypographyProps={{ 
              variant: 'body2',
              sx: { 
                fontWeight: outline.selected ? 'bold' : 'normal',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }
            }}
          />
        )}
        
        {!isEditing && isHovering && (
          <DragIndicatorIcon 
            {...attributes} 
            {...listeners} 
            sx={{ cursor: 'grab', fontSize: 18, color: 'action.active' }} 
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </ListItemButton>
    </ListItem>
  );
};

const PropertiesPanel: React.FC = () => {
  const { outlines, updateOutline, selectOutline, reorderOutlines } = useStore();
  const selectedOutline = outlines.find(o => o.selected);
  
  const [properties, setProperties] = useState({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    rotation: 0,
    radius: 0,
    depth: 0
  });

  // Calculate bin dimensions
  const { min, max } = calculateMinimalGridArea(outlines);
  const binWidth = max.x - min.x;
  const binHeight = max.y - min.y;
  
  // Apply tolerance before computing grid units to get clean numbers
  const gridUnitsWidth = Math.floor((binWidth + TOLERANCE) / GRID_SIZE);
  const gridUnitsHeight = Math.floor((binHeight + TOLERANCE) / GRID_SIZE);

  // Format values for display with 2 decimal places
  const formatDisplayValue = (value: number): string => {
    return '' + (Math.round((value + Number.EPSILON) * 100) / 100);
  };
  
  useEffect(() => {
    if (selectedOutline) {
      let width = 0;
      let height = 0;
      
      if (selectedOutline.type === 'roundedRect') {
        const rectOutline = selectedOutline as RoundedRectOutline;
        width = rectOutline.width;
        height = rectOutline.height;
        setProperties({
          x: selectedOutline.position.x,
          y: selectedOutline.position.y,
          width,
          height,
          rotation: selectedOutline.rotation,
          radius: rectOutline.radius,
          depth: selectedOutline.depth
        });
      } else {
        // For splines, use the bounds for read-only width/height
        const { bounds } = selectedOutline;
        width = bounds.maxX - bounds.minX;
        height = bounds.maxY - bounds.minY;
        setProperties({
          x: selectedOutline.position.x,
          y: selectedOutline.position.y,
          width,
          height,
          rotation: selectedOutline.rotation,
          radius: 0,
          depth: selectedOutline.depth
        });
      }
    }
  }, [selectedOutline]);

  const handleChange = (property: string, value: string) => {
    if (!selectedOutline) return;
    
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return;
    
    // Prepare updates for the store
    const updates: Record<string, unknown> = {};
    
    // Apply minimum constraints
    let validatedValue = numValue;
    if (property === 'width' || property === 'height') {
      validatedValue = Math.max(1, numValue); // Minimum 1mm for width/height
    } else if (property === 'radius') {
      // Ensure radius isn't larger than half the smallest dimension
      const minDimension = Math.min(properties.width, properties.height);
      validatedValue = Math.max(0, Math.min(minDimension / 2, numValue));
    } else if (property === 'depth') {
      validatedValue = Math.max(1, Math.min(250, numValue)); // Limit depth between 1mm and 250mm
    }
    
    // Update local state
    setProperties({
      ...properties,
      [property]: validatedValue
    });
    
    switch (property) {
      case 'x':
        updates.position = { ...selectedOutline.position, x: validatedValue };
        break;
      case 'y':
        updates.position = { ...selectedOutline.position, y: validatedValue };
        break;
      case 'rotation':
        updates.rotation = validatedValue;
        break;
      case 'depth':
        updates.depth = validatedValue;
        break;
      case 'width':
      case 'height':
      case 'radius':
        if (selectedOutline.type === 'roundedRect') {
          updates[property] = validatedValue;
        }
        break;
    }
    
    // Update the store if we have any changes
    if (Object.keys(updates).length > 0) {
      updateOutline(selectedOutline.id, updates);
    }
  };

  const handleObjectClick = (id: string, multiSelect: boolean = false) => {
    selectOutline(id, multiSelect);
  };
  
  const handleRename = (id: string, newName: string) => {
    updateOutline(id, { name: newName });
  };

  // Setup DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // Only start dragging after moving 5px to avoid conflict with clicking
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      // Find original array indices
      const sourceIndex = outlines.findIndex(o => o.id === active.id);
      const destinationIndex = outlines.findIndex(o => o.id === over.id);
      
      // Update the store with the correct indices
      reorderOutlines(sourceIndex, destinationIndex);
    }
  };
  

  return (
    <Box 
      sx={{ 
        width: 275, 
        height: '100%', 
        backgroundColor: '#fff',
        borderRight: '1px solid #e0e0e0',
        p: 2,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto'
      }}
    >
      {/* Bin Status Section */}
      <Typography variant="subtitle1" sx={{ mb: 1 }}>
        {gridUnitsWidth}x{gridUnitsHeight} bin ({binWidth.toFixed(1)}x{binHeight.toFixed(1)}mm)
      </Typography>
      
      {/* Objects TreeView */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={[...outlines].reverse().map(outline => outline.id)}
          strategy={verticalListSortingStrategy}
        >
          <List disablePadding>
            {[...outlines].reverse().map((outline) => (
              <SortableItem 
                key={outline.id}
                id={outline.id}
                outline={outline}
                onSelect={handleObjectClick}
                onRename={handleRename}
              />
            ))}
          </List>
        </SortableContext>
      </DndContext>
      
      <Divider sx={{ mb: 1 }} />
      
      {/* Selected Object Properties */}
      {selectedOutline ? (
        <>
          <Typography variant="subtitle1" sx={{ mb: 2 }}>
            {selectedOutline.type === 'roundedRect' ? 'Rounded Rectangle' : 'Spline'}
          </Typography>
          
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <TextField
              label="x"
              size="small"
              type="number"
              inputProps={{ 
                step: 1,
                style: { textAlign: 'right' }
              }}
              value={formatDisplayValue(properties.x)}
              onChange={(e) => handleChange('x', e.target.value)}
              onBlur={() => {
                // Force update on blur to ensure constraints are applied
                handleChange('x', properties.x.toString());
              }}
              sx={{ width: '48%' }}
              InputLabelProps={{ shrink: true }}
              InputProps={{ endAdornment: <Typography variant="caption">mm</Typography> }}
            />
            <TextField
              label="y"
              size="small"
              type="number"
              inputProps={{ 
                step: 1,
                style: { textAlign: 'right' }
              }}
              value={formatDisplayValue(properties.y)}
              onChange={(e) => handleChange('y', e.target.value)}
              onBlur={() => {
                handleChange('y', properties.y.toString());
              }}
              sx={{ width: '48%' }}
              InputLabelProps={{ shrink: true }}
              InputProps={{ endAdornment: <Typography variant="caption">mm</Typography> }}
            />
          </Box>
          
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <TextField
              label="w"
              size="small"
              type="number"
              inputProps={{ 
                min: 1, 
                step: 1,
                style: { textAlign: 'right' }
              }}
              value={formatDisplayValue(properties.width)}
              onChange={(e) => handleChange('width', e.target.value)}
              onBlur={() => {
                handleChange('width', properties.width.toString());
              }}
              disabled={selectedOutline.type !== 'roundedRect'}
              sx={{ width: '48%' }}
              InputLabelProps={{ shrink: true }}
              InputProps={{ endAdornment: <Typography variant="caption">mm</Typography> }}
            />
            <TextField
              label="h"
              size="small"
              type="number"
              inputProps={{ 
                min: 1, 
                step: 1,
                style: { textAlign: 'right' }
              }}
              value={formatDisplayValue(properties.height)}
              onChange={(e) => handleChange('height', e.target.value)}
              onBlur={() => {
                handleChange('height', properties.height.toString());
              }}
              disabled={selectedOutline.type !== 'roundedRect'}
              sx={{ width: '48%' }}
              InputLabelProps={{ shrink: true }}
              InputProps={{ endAdornment: <Typography variant="caption">mm</Typography> }}
            />
          </Box>
          
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <TextField
              label="θ"
              size="small"
              type="number"
              inputProps={{ 
                step: 0.5,
                style: { textAlign: 'right' }
              }}
              value={formatDisplayValue(properties.rotation)}
              onChange={(e) => handleChange('rotation', e.target.value)}
              onBlur={() => {
                handleChange('rotation', properties.rotation.toString());
              }}
              sx={{ width: '48%' }}
              InputLabelProps={{ shrink: true }}
              InputProps={{ endAdornment: <Typography variant="caption">°</Typography> }}
            />
            
            {selectedOutline.type === 'roundedRect' && (
              <TextField
                label="r"
                size="small"
                type="number"
                inputProps={{ 
                  min: 0,
                  max: Math.min(properties.width, properties.height) / 2,
                  step: 0.1,
                  style: { textAlign: 'right' }
                }}
                value={formatDisplayValue(properties.radius)}
                onChange={(e) => handleChange('radius', e.target.value)}
                onBlur={() => {
                  handleChange('radius', properties.radius.toString());
                }}
                sx={{ width: '48%' }}
                InputLabelProps={{ shrink: true }}
                InputProps={{ endAdornment: <Typography variant="caption">mm</Typography> }}
              />
            )}
          </Box>
          
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <TextField
              label="depth"
              size="small"
              type="number"
              inputProps={{ 
                min: 1,
                max: 250,
                step: 1,
                style: { textAlign: 'right' }
              }}
              value={formatDisplayValue(properties.depth)}
              onChange={(e) => handleChange('depth', e.target.value)}
              onBlur={() => {
                handleChange('depth', properties.depth.toString());
              }}
              sx={{ width: '48%' }}
              InputLabelProps={{ shrink: true }}
              InputProps={{ endAdornment: <Typography variant="caption">mm</Typography> }}
            />
          </Box>
        </>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          No shape selected
        </Typography>
      )}
    </Box>
  );
};

export default PropertiesPanel;