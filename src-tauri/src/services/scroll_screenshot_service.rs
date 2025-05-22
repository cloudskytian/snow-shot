use fast_image_resize::{FilterType, ResizeAlg, ResizeOptions};
use fast_image_resize::{PixelType, Resizer, images::Image};
use hora::core::ann_index::ANNIndex;
use hora::core::metrics::Metric;
use hora::index::{hnsw_idx::HNSWIndex, hnsw_params::HNSWParams};
use image::{DynamicImage, GenericImageView, GrayImage};
use imageproc::corners;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(PartialEq, Serialize, Deserialize, Debug, Clone, Copy)]
pub enum ScrollDirection {
    /// 垂直滚动
    Vertical = 0,
    /// 水平滚动
    Horizontal = 1,
}

#[derive(PartialEq, Serialize, Deserialize, Debug, Clone, Copy)]
pub enum ScrollImageList {
    /// 上图片列表
    Top = 0,
    /// 下图片列表
    Bottom = 1,
}

#[derive(Debug, Clone, Copy, Eq, Hash, PartialEq)]
pub struct ScrollOffset {
    pub x: i32,
    pub y: i32,
}

impl ScrollOffset {
    pub fn new(x: i32, y: i32) -> Self {
        Self { x, y }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct CropRegion {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

impl CropRegion {
    pub fn new(x: u32, y: u32, width: u32, height: u32) -> Self {
        Self {
            x,
            y,
            width,
            height,
        }
    }
}

#[derive(Debug)]
pub struct ScrollIndex {
    pub position: i32,
    pub ann_index: HNSWIndex<f32, usize>,
    pub corners: Vec<ScrollOffset>,
    pub descriptors: Vec<Vec<f32>>,
}

impl ScrollIndex {
    pub fn new(dimension: usize) -> Self {
        let mut index_params = HNSWParams::<f32>::default();
        index_params.ef_search = 24;
        index_params.ef_build = 12;

        Self {
            position: 0,
            ann_index: HNSWIndex::new(dimension, &index_params),
            corners: vec![],
            descriptors: vec![],
        }
    }
}

pub struct ScrollScreenshotService {
    /// 滚动截图列表（上或左）
    pub top_image_list: Vec<image::DynamicImage>,
    /// 滚动截图列表（下或右）
    pub bottom_image_list: Vec<image::DynamicImage>,
    /// 当前方向
    pub current_direction: ScrollDirection,
    /// 图片宽度
    pub image_width: u32,
    /// 图片高度
    pub image_height: u32,
    /// 上图片尺寸（方向边）
    pub top_image_size: i32,
    /// 上图片索引尺寸（方向边）
    pub top_image_index_size: i32,
    /// 下图片尺寸（方向边）
    pub bottom_image_size: i32,
    /// 下图片索引尺寸（方向边）
    pub bottom_image_index_size: i32,
    /// 图片缩放
    pub image_scale: f32,
    /// 图片缩放器
    pub image_resizer: Resizer,
    /// 特征点阈值
    pub corner_threshold: u8,
    /// 描述符块大小
    pub descriptor_patch_size: usize,
    /// 特征点索引（上或右）
    pub top_image_ann_index: ScrollIndex,
    /// 特征点索引（下或左）
    pub bottom_image_ann_index: ScrollIndex,
    /// 最小变化量（高于该值才会建立索引）
    pub min_size_delta: i32,
    /// 缩放的图片宽度
    pub image_dst_width: u32,
    /// 缩放的图片高度
    pub image_dst_height: u32,
    /// 滚动方向的图片尺寸
    pub image_scroll_side_size: i32,
}

impl ScrollScreenshotService {
    fn get_descriptor_size(&self) -> usize {
        self.descriptor_patch_size & !1
    }

    fn compute_descriptor(&self, img: &image::GrayImage, corner: &ScrollOffset) -> Vec<f32> {
        let descriptor_size = self.descriptor_patch_size;
        let mut descriptor = Vec::with_capacity(self.get_descriptor_size());
        let half_size = descriptor_size as i32 / 2;

        let corner_x = corner.x;
        let corner_y = corner.y;
        let width = img.width() as i32;
        let height = img.height() as i32;

        // 计算行特征
        for row in 0..(descriptor_size / 2) {
            let y = corner_y + (-half_size + row as i32 * 2);
            let mut sum = 0.0;
            let mut valid_pixels = 0;

            for col in 0..(descriptor_size / 2) {
                let x = corner_x + (-half_size + col as i32 * 2);

                if x >= 0 && x < width && y >= 0 && y < height {
                    let pixel = unsafe { img.unsafe_get_pixel(x as u32, y as u32) };
                    sum += pixel[0] as f32 / 255.0;
                    valid_pixels += 1;
                }
            }

            descriptor.push(if valid_pixels > 0 {
                sum / valid_pixels as f32
            } else {
                0.0
            });
        }

        // 计算列特征
        for col in 0..(descriptor_size / 2) {
            let x = corner_x + (-half_size + col as i32 * 2);
            let mut sum = 0.0;
            let mut valid_pixels = 0;

            for row in 0..(descriptor_size / 2) {
                let y = corner_y + (-half_size + row as i32 * 2);

                if x >= 0 && x < width && y >= 0 && y < height {
                    let pixel = unsafe { img.unsafe_get_pixel(x as u32, y as u32) };
                    sum += pixel[0] as f32 / 255.0;
                    valid_pixels += 1;
                }
            }

            descriptor.push(if valid_pixels > 0 {
                sum / valid_pixels as f32
            } else {
                0.0
            });
        }

        descriptor
    }

    fn euclidean_distance(a: &[f32], b: &[f32]) -> f32 {
        a.iter()
            .zip(b.iter())
            .map(|(x, y)| (x - y).powi(2))
            .sum::<f32>()
            .sqrt()
    }

    pub fn new() -> Self {
        Self {
            top_image_list: vec![],
            bottom_image_list: vec![],
            current_direction: ScrollDirection::Vertical,
            image_width: 0,
            image_height: 0,
            top_image_size: 0,
            top_image_index_size: 0,
            bottom_image_size: 0,
            bottom_image_index_size: 0,
            image_scale: 1.0,
            image_resizer: Resizer::new(),
            corner_threshold: 64,
            descriptor_patch_size: 9,
            min_size_delta: 64,
            image_dst_width: 0,
            image_dst_height: 0,
            image_scroll_side_size: 0,
            top_image_ann_index: ScrollIndex::new(0),
            bottom_image_ann_index: ScrollIndex::new(0),
        }
    }

    pub fn clear(&mut self) {
        self.top_image_list.clear();
        self.bottom_image_list.clear();
        self.top_image_ann_index = ScrollIndex::new(0);
        self.bottom_image_ann_index = ScrollIndex::new(0);
    }

    pub fn init(
        &mut self,
        direction: ScrollDirection,
        image_width: u32,
        image_height: u32,
        sample_rate: f32,
        min_sample_size: u32,
        max_sample_size: u32,
        corner_threshold: u8,
        descriptor_patch_size: usize,
        min_size_delta: i32,
    ) {
        self.top_image_list.clear();
        self.bottom_image_list.clear();
        self.current_direction = direction;
        self.image_width = image_width;
        self.image_height = image_height;
        self.top_image_size = 0;
        self.bottom_image_size = 0;
        self.corner_threshold = corner_threshold;
        self.descriptor_patch_size = descriptor_patch_size;
        self.min_size_delta = min_size_delta;
        self.top_image_index_size = 0;
        self.bottom_image_index_size = 0;
        self.top_image_ann_index = ScrollIndex::new(self.get_descriptor_size());
        self.bottom_image_ann_index = ScrollIndex::new(self.get_descriptor_size());

        let image_scale_side_size;
        if self.current_direction == ScrollDirection::Vertical {
            image_scale_side_size = image_width as f32;
        } else {
            image_scale_side_size = image_height as f32;
        }

        let target_side_size = (image_scale_side_size * sample_rate)
            .min(max_sample_size as f32)
            .max(min_sample_size as f32);

        self.image_scale = (target_side_size / image_scale_side_size).min(1.0);

        if self.current_direction == ScrollDirection::Vertical {
            self.image_dst_width = (image_width as f32 * self.image_scale) as u32;
            self.image_dst_height = image_height;
        } else {
            self.image_dst_width = image_width;
            self.image_dst_height = (image_height as f32 * self.image_scale) as u32;
        }

        self.image_scroll_side_size = if self.current_direction == ScrollDirection::Vertical {
            self.image_height as i32
        } else {
            self.image_width as i32
        };
    }

    fn get_descriptors(
        &self,
        image: &image::ImageBuffer<image::Luma<u8>, Vec<u8>>,
        corners: &[ScrollOffset],
    ) -> Vec<Vec<f32>> {
        corners
            .par_iter()
            .map(|corner| self.compute_descriptor(image, corner))
            .collect()
    }

    fn get_gray_image(&mut self, image: &DynamicImage) -> GrayImage {
        let image_width = image.width();
        let image_height = image.height();

        // 先转为灰度图再缩放，效率更高
        let mut gray_image = image.to_luma8();

        if self.image_scale >= 1.0 {
            return gray_image;
        }

        let src_image = Image::from_slice_u8(
            image_width,
            image_height,
            gray_image.as_mut(),
            PixelType::U8,
        )
        .unwrap();

        let mut dst_image = Image::new(self.image_dst_width, self.image_dst_height, PixelType::U8);

        self.image_resizer
            .resize(
                &src_image,
                &mut dst_image,
                &ResizeOptions::new().resize_alg(ResizeAlg::Nearest),
            )
            .unwrap();

        GrayImage::from_vec(
            self.image_dst_width,
            self.image_dst_height,
            dst_image.into_vec(),
        )
        .unwrap()
    }

    fn get_crop_region(&self, delta_size: i32) -> CropRegion {
        let image_width = self.image_width;
        let image_height = self.image_height;
        let region: CropRegion;

        if self.current_direction == ScrollDirection::Vertical {
            let start_position = image_height - delta_size.abs() as u32;
            if delta_size > 0 {
                region = CropRegion::new(
                    0,
                    start_position,
                    image_width,
                    image_height - start_position,
                );
            } else {
                region = CropRegion::new(0, 0, image_width, image_height - start_position);
            }
        } else {
            let start_position = image_width - delta_size.abs() as u32;
            if start_position > 0 {
                region = CropRegion::new(
                    start_position,
                    0,
                    image_width - start_position,
                    image_height,
                );
            } else {
                region = CropRegion::new(0, 0, image_width - start_position, image_height);
            }
        }

        region
    }

    fn filter_corners_with_region(
        &self,
        corners: &[ScrollOffset],
        region: &CropRegion,
    ) -> Vec<ScrollOffset> {
        let min_x = region.x as i32;
        let max_x = (region.x + region.width) as i32;
        let min_y = region.y as i32;
        let max_y = (region.y + region.height) as i32;

        corners
            .par_iter()
            .filter_map(|corner| {
                if corner.x >= min_x && corner.x < max_x && corner.y >= min_y && corner.y < max_y {
                    Some(*corner)
                } else {
                    None
                }
            })
            .collect()
    }

    fn get_corners(&self, image: &image::GrayImage) -> Vec<ScrollOffset> {
        corners::corners_fast12(image, self.corner_threshold)
            .iter()
            .map(|corner| ScrollOffset {
                x: corner.x as i32,
                y: corner.y as i32,
            })
            .collect()
    }

    fn build_index(
        &mut self,
        gray_image: image::GrayImage,
        image_corners: &[ScrollOffset],
        edge_position: i32,
        index_edge_position_distance: i32,
    ) {
        let mut new_scroll_index = ScrollIndex::new(self.get_descriptor_size());

        new_scroll_index.descriptors = self.get_descriptors(&gray_image, &image_corners);

        new_scroll_index.corners = image_corners.to_vec();

        let mut index_params = HNSWParams::<f32>::default();
        index_params.ef_search = 32;
        index_params.ef_build = 16;

        new_scroll_index
            .descriptors
            .iter()
            .enumerate()
            .for_each(|(i, descriptor)| {
                new_scroll_index.ann_index.add(descriptor, i).unwrap();
            });

        new_scroll_index.ann_index.build(Metric::Euclidean).unwrap();

        let index_position = if edge_position > 0 {
            self.bottom_image_index_size - index_edge_position_distance
        } else {
            -(self.top_image_index_size - index_edge_position_distance)
        };

        new_scroll_index.position = index_position;

        if edge_position > 0 {
            self.bottom_image_ann_index = new_scroll_index;
        } else {
            self.top_image_ann_index = new_scroll_index;
        }
    }

    fn add_index(
        &mut self,
        image: image::DynamicImage,
        gray_image: image::GrayImage,
        image_corners: Vec<ScrollOffset>,
        edge_position: i32,
        delta_size: i32,
    ) -> (image::DynamicImage, i32) {
        let mut index_delta_size = 0;

        let image_scroll_side_size = self.image_scroll_side_size;

        let index_edge_position_distance = if delta_size > 0 {
            self.bottom_image_index_size - (edge_position - image_scroll_side_size)
        } else {
            self.top_image_index_size + edge_position
        };

        if index_edge_position_distance <= self.min_size_delta {
            index_delta_size = image_scroll_side_size - index_edge_position_distance;
            self.build_index(
                gray_image,
                &image_corners,
                edge_position,
                index_edge_position_distance,
            );
        }

        let region = self.get_crop_region(delta_size);
        (
            image.crop_imm(region.x, region.y, region.width, region.height),
            index_delta_size,
        )
    }

    fn push_image(
        &mut self,
        image: image::DynamicImage,
        gray_image: image::GrayImage,
        image_corners: Vec<ScrollOffset>,
        index_position: i32,
        origin_position: ScrollOffset,
        new_position: ScrollOffset,
    ) -> (i32, Option<ScrollImageList>) {
        let position_offset = if self.current_direction == ScrollDirection::Vertical {
            ScrollOffset {
                x: origin_position.x - new_position.x,
                y: origin_position.y - new_position.y + index_position,
            }
        } else {
            ScrollOffset {
                x: origin_position.x - new_position.x + index_position,
                y: origin_position.y - new_position.y,
            }
        };

        let image_scroll_side_size = if self.current_direction == ScrollDirection::Vertical {
            self.image_height as i32
        } else {
            self.image_width as i32
        };

        // 计算边缘位置
        let edge_position = if self.current_direction == ScrollDirection::Vertical {
            if position_offset.y >= 0 {
                position_offset.y + image_scroll_side_size
            } else {
                position_offset.y
            }
        } else {
            if position_offset.x >= 0 {
                position_offset.x + image_scroll_side_size
            } else {
                position_offset.x
            }
        };

        // 处理新增区域
        let (delta_size, is_bottom) =
            if edge_position >= 0 && edge_position >= self.bottom_image_size {
                (edge_position - self.bottom_image_size, true)
            } else if edge_position < 0 && edge_position.abs() >= self.top_image_size {
                (edge_position + self.top_image_size, false)
            } else {
                return (edge_position, None); // 没有新增区域或变化太小
            };

        let (cropped_image, index_delta_size) =
            self.add_index(image, gray_image, image_corners, edge_position, delta_size);

        if is_bottom {
            self.bottom_image_list.push(cropped_image.clone());
            self.bottom_image_size += delta_size;
            self.bottom_image_index_size += index_delta_size;

            (edge_position, Some(ScrollImageList::Bottom))
        } else {
            self.top_image_list.push(cropped_image);
            self.top_image_size -= delta_size;
            self.top_image_index_size += index_delta_size;

            (edge_position, Some(ScrollImageList::Top))
        }
    }

    pub fn get_offsets<'a>(
        &self,
        index: &'a ScrollIndex,
        image_descriptors: &[Vec<f32>],
        image_corners: &[ScrollOffset],
        scroll_image_list: ScrollImageList,
    ) -> Option<(&'a ScrollIndex, usize, usize)> {
        let image_scroll_side_size = if self.current_direction == ScrollDirection::Vertical {
            self.image_height as i32
        } else {
            self.image_width as i32
        };
        let min_diff = if scroll_image_list == ScrollImageList::Bottom {
            -(self.bottom_image_size - image_scroll_side_size + 1) + index.position
        } else {
            (self.top_image_size + 1) + index.position
        };

        let offsets: Vec<(i32, &'a ScrollIndex, usize, usize)> = image_descriptors
            .par_iter()
            .enumerate()
            .filter_map(|(i, descriptor)| {
                let search_result = index.ann_index.search(descriptor, 1);
                if search_result.is_empty() {
                    return None;
                }

                let idx1 = search_result[0];
                let dist = Self::euclidean_distance(&index.descriptors[idx1], descriptor);

                let point1 = &index.corners[idx1];
                let point2 = &image_corners[i];
                let dy = point2.y - point1.y;
                let dx = point2.x - point1.x;

                let diff: i32 = if self.current_direction == ScrollDirection::Vertical {
                    if dx != 0 {
                        return None;
                    }

                    dy
                } else {
                    if dy != 0 {
                        return None;
                    }

                    dx
                };

                // 保留 0 的偏移防止，出现画面不变，记录意料外的截图
                if min_diff < 0 && min_diff < diff {
                    return None;
                }

                if min_diff > 0 && min_diff > diff {
                    return None;
                }

                if dist < 0.1 {
                    Some((diff, index, idx1, i))
                } else {
                    None
                }
            })
            .collect();

        if offsets.is_empty() {
            return None;
        }

        // 寻找频率最高的偏移作为主要偏移模式
        let mut offset_counts: std::collections::HashMap<i32, (i32, &ScrollIndex, usize, usize)> =
            std::collections::HashMap::new();
        for (offset, scroll_index, origin_position_index, new_position_index) in offsets {
            if let Some(value) = offset_counts.get_mut(&offset) {
                value.0 += 1;
            } else {
                offset_counts.insert(
                    offset,
                    (1, scroll_index, origin_position_index, new_position_index),
                );
            }
        }

        // let mut sorted_offsets: Vec<_> = offset_counts.iter().collect();
        // sorted_offsets.sort_by_key(|(_, (count, _, _, _))| -count);
        // println!(
        //     "sorted_offsets: {:?}",
        //     sorted_offsets[..10.min(sorted_offsets.len())]
        //         .iter()
        //         .map(|(offset, (count, _, _, _))| (offset, count))
        //         .collect::<Vec<_>>()
        // );

        let mut max_count = 0;
        let mut second_max_count = 0;
        let mut max_offset = None;

        for (_, (count, scroll_index, origin_idx, new_idx)) in &offset_counts {
            if *count > max_count {
                second_max_count = max_count;
                max_count = *count;
                max_offset = Some((scroll_index, origin_idx, new_idx));
            } else if *count > second_max_count {
                second_max_count = *count;
            }
        }

        let max_offset = match max_offset {
            Some(offset) => offset,
            None => return None,
        };

        if max_count < (image_corners.len() as i32 / 10) {
            return None;
        }

        if max_count < second_max_count * 2 {
            return None;
        }

        let (dominant_scroll_index, dominant_origin_position_index, dominant_new_position_index) =
            max_offset;

        Some((
            dominant_scroll_index,
            *dominant_origin_position_index,
            *dominant_new_position_index,
        ))
    }

    pub fn handle_image(
        &mut self,
        image: DynamicImage,
        scroll_image_list: ScrollImageList,
    ) -> Option<(i32, Option<ScrollImageList>)> {
        let image_width = image.width();
        let image_height = image.height();

        if image_width != self.image_width || image_height != self.image_height {
            return None;
        }

        let gray_image = self.get_gray_image(&image);

        // 提取当前图片的特征点
        let image_corners = self.get_corners(&gray_image);

        if image_corners.is_empty() {
            return None;
        }

        let image_descriptors = self.get_descriptors(&gray_image, &image_corners);

        if self.top_image_list.is_empty() && self.bottom_image_list.is_empty() {
            let bottom_image = self.push_image(
                image,
                gray_image,
                image_corners.clone(),
                0,
                ScrollOffset { x: 0, y: 0 },
                ScrollOffset { x: 0, y: 0 },
            );

            let mut new_top_image_ann_index = ScrollIndex::new(self.get_descriptor_size());
            new_top_image_ann_index.descriptors = image_descriptors;
            new_top_image_ann_index.corners = image_corners;
            new_top_image_ann_index
                .descriptors
                .iter()
                .enumerate()
                .for_each(|(i, descriptor)| {
                    new_top_image_ann_index
                        .ann_index
                        .add(descriptor, i)
                        .unwrap();
                });

            new_top_image_ann_index
                .ann_index
                .build(Metric::Euclidean)
                .unwrap();

            self.top_image_ann_index = new_top_image_ann_index;

            return Some(bottom_image);
        }

        let target_index = if scroll_image_list == ScrollImageList::Top {
            &self.top_image_ann_index
        } else {
            &self.bottom_image_ann_index
        };

        // 从边缘遍历
        let offsets = self.get_offsets(
            target_index,
            &image_descriptors,
            &image_corners,
            scroll_image_list,
        );

        if offsets.is_none() {
            return None;
        }

        let (dominant_scroll_index, dominant_origin_position_index, dominant_new_position_index) =
            match offsets {
                Some(offsets) => offsets,
                None => return None,
            };

        let origin_position = dominant_scroll_index.corners[dominant_origin_position_index];
        let new_position = image_corners[dominant_new_position_index];

        // 将偏移的图片推到列表中
        Some(self.push_image(
            image,
            gray_image,
            image_corners,
            dominant_scroll_index.position,
            origin_position,
            new_position,
        ))
    }

    pub fn export(&mut self) -> Option<image::DynamicImage> {
        if self.top_image_list.is_empty() && self.bottom_image_list.is_empty() {
            return None;
        }

        // 计算最终图片尺寸
        let (total_width, total_height) = if self.current_direction == ScrollDirection::Vertical {
            (
                self.image_width,
                (self.top_image_size + self.bottom_image_size) as u32,
            )
        } else {
            (
                (self.top_image_size + self.bottom_image_size) as u32,
                self.image_height,
            )
        };

        // 创建最终大小的图片
        let mut final_image = image::DynamicImage::new_rgb8(total_width, total_height);

        // 当前位置偏移量
        let mut offset_x = 0;
        let mut offset_y = 0;

        // 先处理top_image_list（从尾部开始，即倒序）
        if self.current_direction == ScrollDirection::Vertical {
            // 垂直方向，从顶部开始
            offset_y = 0;
        } else {
            // 水平方向，从左侧开始
            offset_x = 0;
        }

        for img in self.top_image_list.iter().rev() {
            if self.current_direction == ScrollDirection::Vertical {
                // 垂直拼接
                image::imageops::overlay(&mut final_image, img, 0, offset_y as i64);
                offset_y += img.height();
            } else {
                // 水平拼接
                image::imageops::overlay(&mut final_image, img, offset_x as i64, 0);
                offset_x += img.width();
            }
        }

        // 再处理bottom_image_list（从头部开始，即正序）
        for img in &self.bottom_image_list {
            if self.current_direction == ScrollDirection::Vertical {
                // 垂直拼接
                image::imageops::overlay(&mut final_image, img, 0, offset_y as i64);
                offset_y += img.height();
            } else {
                // 水平拼接
                image::imageops::overlay(&mut final_image, img, offset_x as i64, 0);
                offset_x += img.width();
            }
        }

        self.clear();

        Some(final_image)
    }
}
